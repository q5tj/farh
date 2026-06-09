-- ============================================================
-- migration_v26: providers.slug for pretty URLs
--
-- Until this migration provider pages lived at /provider/<uuid> —
-- noisy, unmemorable, and exposing internal ids in the URL bar.
-- This migration adds a short, URL-safe slug derived from the
-- English store name and keeps it unique. The route layer then
-- routes /provider/<slug> using the new column.
--
-- §1 schema: add `slug text unique` to providers.
-- §2 function: slugify English (or Arabic) text → lowercase a–z 0–9 + hyphens.
-- §3 trigger: auto-populate slug on insert/update if missing or empty.
-- §4 backfill: walk existing rows and assign slugs, appending -2, -3, ...
--    on collisions so the UNIQUE constraint never blocks the backfill.
-- ============================================================

begin;

-- §1 ----------------------------------------------------------
alter table public.providers
  add column if not exists slug text;

-- §2 ----------------------------------------------------------
-- Lowercases, strips non-alphanumerics, collapses whitespace into hyphens,
-- and trims leading/trailing hyphens. Works for ASCII; for Arabic-only
-- names we fall back to a hash-style id so we never produce empty slugs.
create or replace function public.slugify(p_text text)
returns text
language plpgsql immutable as $$
declare
  s text;
begin
  if p_text is null then return null; end if;
  s := lower(trim(p_text));
  s := regexp_replace(s, '[^a-z0-9\s-]', '', 'g');
  s := regexp_replace(s, '\s+', '-', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := trim(both '-' from s);
  if s = '' then return null; end if;
  return s;
end $$;

-- §3 ----------------------------------------------------------
create or replace function public.providers_set_slug()
returns trigger
language plpgsql as $$
declare
  base   text;
  candidate text;
  attempt int := 0;
begin
  if new.slug is null or btrim(new.slug) = '' then
    base := coalesce(public.slugify(new.name_en), public.slugify(new.name));
    if base is null then
      -- Arabic-only / nothing English to slugify → fall back to a short
      -- substring of the row UUID. Ugly but stable and unique.
      base := substr(replace(new.id::text, '-', ''), 1, 8);
    end if;
    candidate := base;
    while exists (
      select 1 from public.providers p
      where p.slug = candidate and p.id <> new.id
    ) loop
      attempt := attempt + 1;
      candidate := base || '-' || attempt::text;
    end loop;
    new.slug := candidate;
  end if;
  return new;
end $$;

drop trigger if exists trg_providers_set_slug on public.providers;
create trigger trg_providers_set_slug
  before insert or update of name, name_en, slug on public.providers
  for each row execute function public.providers_set_slug();

-- §4 ----------------------------------------------------------
-- Backfill in a deterministic order so the same provider always wins the
-- bare slug on re-runs (which would only happen if the column was wiped
-- and the migration re-applied — defensive, not required).
do $$
declare
  r record;
  base text;
  candidate text;
  attempt int;
begin
  for r in
    select id, name, name_en
    from public.providers
    where slug is null or btrim(slug) = ''
    order by created_at asc
  loop
    base := coalesce(public.slugify(r.name_en), public.slugify(r.name));
    if base is null then
      base := substr(replace(r.id::text, '-', ''), 1, 8);
    end if;
    candidate := base;
    attempt := 0;
    while exists (
      select 1 from public.providers p
      where p.slug = candidate and p.id <> r.id
    ) loop
      attempt := attempt + 1;
      candidate := base || '-' || attempt::text;
    end loop;
    update public.providers set slug = candidate where id = r.id;
  end loop;
end $$;

-- Enforce uniqueness after the backfill is consistent.
alter table public.providers
  alter column slug set not null;
create unique index if not exists idx_providers_slug
  on public.providers (slug);

commit;
