-- ============================================================
-- فرحتكم | Farhatukum — Migration v9
-- Gallery (images/videos/files) + Cancellation & refunds +
-- Reviews moderation + Provider geolocation + Service areas multi
-- نفّذ بعد migration_v8 في SQL Editor
-- ============================================================
-- هذا الـ migration يضيف:
--   §1  provider_images → media items (image/video/file) + storage path
--   §2  bookings        → cancelled_at / cancelled_by / cancellation_reason
--                          + refund_status enum (idempotent)
--   §3  reviews         → is_hidden / hidden_by / hidden_reason / hidden_at
--                          + rating recalculation skips hidden reviews
--   §4  providers       → lat / lng (للخرائط والربط بالمكان)
--   §5  storage         → bucket "provider-media" + RLS
--   §6  RPCs            → cancel_booking / admin_set_review_hidden
-- ============================================================


-- ============================================================
-- §1 PROVIDER_IMAGES → media items
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'media_kind') then
    create type media_kind as enum ('image','video','file');
  end if;
end $$;

alter table public.provider_images
  add column if not exists kind media_kind not null default 'image',
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists thumbnail_url text,
  add column if not exists caption text;

comment on column public.provider_images.kind is
  'image | video | file — drives the renderer on the gallery.';
comment on column public.provider_images.storage_path is
  'Object key in provider-media bucket. Owned by the provider; we delete from storage on row delete via DB hook.';
comment on column public.provider_images.thumbnail_url is
  'Public URL for the video poster frame (videos only).';


-- ============================================================
-- §2 BOOKINGS — cancellation + refund tracking
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'refund_status') then
    create type refund_status as enum (
      'not_required',
      'pending',
      'completed',
      'failed'
    );
  end if;
end $$;

alter table public.bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by user_role,
  add column if not exists cancellation_reason text,
  add column if not exists refund_status refund_status not null default 'not_required';

create index if not exists idx_bookings_refund_status
  on public.bookings(refund_status)
  where refund_status in ('pending','failed');


-- ============================================================
-- §3 REVIEWS — moderation flags
-- ============================================================
alter table public.reviews
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_by uuid references public.users(id) on delete set null,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at timestamptz;

-- Rating recalc trigger: ignore hidden reviews + handle DELETE events
-- (the existing trigger from schema.sql uses new.provider_id which is NULL on
--  delete; this version is delete-safe).
create or replace function public.refresh_provider_rating()
returns trigger language plpgsql as $$
declare
  pid uuid;
begin
  pid := coalesce(new.provider_id, old.provider_id);
  if pid is null then
    return coalesce(new, old);
  end if;
  update public.providers p set
    rating_avg = coalesce(
      (select avg(rating)::numeric(3,2)
         from public.reviews
         where provider_id = pid and is_hidden = false),
      0
    ),
    rating_count = (
      select count(*)
        from public.reviews
        where provider_id = pid and is_hidden = false
    ),
    updated_at = now()
  where p.id = pid;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_refresh_rating on public.reviews;
create trigger trg_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_provider_rating();


-- ============================================================
-- §4 PROVIDERS — geolocation
-- ============================================================
alter table public.providers
  add column if not exists lat double precision,
  add column if not exists lng double precision;

-- Cheap range index for "nearby" queries down the line.
create index if not exists idx_providers_geo
  on public.providers(lat, lng)
  where lat is not null and lng is not null;


-- ============================================================
-- §5 STORAGE — provider-media bucket
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'provider-media',
  'provider-media',
  true,
  -- 60 MB upper bound per object — plenty for compressed clips.
  62914560,
  array[
    'image/webp','image/jpeg','image/png','image/gif',
    'video/mp4','video/quicktime','video/webm',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects
  for select
  using (bucket_id = 'provider-media');

drop policy if exists "media_owner_insert" on storage.objects;
create policy "media_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'provider-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_owner_update" on storage.objects;
create policy "media_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'provider-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_owner_delete" on storage.objects;
create policy "media_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'provider-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );


-- ============================================================
-- §6 RPCs
-- ============================================================

-- 6.1 cancel_booking — customer or provider can cancel a pending/accepted
-- booking with a reason. Sets refund_status if the booking was paid so an
-- admin can process it (Moyasar integration is deferred).
create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.bookings%rowtype;
  current_user_db_id uuid;
  current_role user_role;
  is_owner boolean;
  is_provider boolean;
begin
  select id, role into current_user_db_id, current_role
  from public.users
  where auth_user_id = auth.uid();
  if current_user_db_id is null then
    raise exception 'No user record';
  end if;

  select * into booking_row from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;

  is_owner := booking_row.user_id = current_user_db_id;
  is_provider := exists (
    select 1 from public.providers
    where id = booking_row.provider_id and user_id = current_user_db_id
  );

  if not (is_owner or is_provider or current_role = 'admin'::user_role) then
    raise exception 'Forbidden';
  end if;

  if booking_row.status not in ('pending'::booking_status, 'accepted'::booking_status) then
    raise exception 'Cannot cancel booking in status %', booking_row.status;
  end if;

  update public.bookings
  set
    status              = 'cancelled'::booking_status,
    cancelled_at        = now(),
    cancelled_by        = current_role,
    cancellation_reason = nullif(trim(p_reason), ''),
    refund_status       = case
      when payment_status = 'paid'::payment_status then 'pending'::refund_status
      else 'not_required'::refund_status
    end,
    updated_at          = now()
  where id = p_booking_id;
end $$;

revoke all on function public.cancel_booking(uuid, text) from public;
grant execute on function public.cancel_booking(uuid, text) to authenticated;


-- 6.2 admin_set_review_hidden — admin only. Hide / unhide a review with a
-- reason. The rating trigger fires on UPDATE so the provider's rating_avg
-- recalculates automatically.
create or replace function public.admin_set_review_hidden(
  p_review_id uuid,
  p_hidden boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_db_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  select id into current_user_db_id
  from public.users where auth_user_id = auth.uid();

  update public.reviews set
    is_hidden     = p_hidden,
    hidden_by     = case when p_hidden then current_user_db_id else null end,
    hidden_reason = case when p_hidden then nullif(trim(p_reason), '') else null end,
    hidden_at     = case when p_hidden then now() else null end
  where id = p_review_id;
end $$;

revoke all on function public.admin_set_review_hidden(uuid, boolean, text) from public;
grant execute on function public.admin_set_review_hidden(uuid, boolean, text) to authenticated;


-- 6.3 admin_mark_refund — admin marks a refund as completed/failed.
create or replace function public.admin_mark_refund(
  p_booking_id uuid,
  p_status refund_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  update public.bookings
  set
    refund_status = p_status,
    payment_status = case
      when p_status = 'completed'::refund_status then 'refunded'::payment_status
      else payment_status
    end,
    updated_at = now()
  where id = p_booking_id;

  -- Optional: log to audit
  insert into public.audit_log (actor_user_id, action, target_table, target_id, payload)
  select
    (select id from public.users where auth_user_id = auth.uid()),
    'refund_mark',
    'bookings',
    p_booking_id::text,
    jsonb_build_object('status', p_status::text, 'note', p_note);
end $$;

revoke all on function public.admin_mark_refund(uuid, refund_status, text) from public;
grant execute on function public.admin_mark_refund(uuid, refund_status, text) to authenticated;


-- ============================================================
-- ✅ Done. اختبر:
--   • create new provider gallery row with kind='video' + thumbnail_url.
--   • cancel a booking via cancel_booking RPC; check refund_status flips
--     to 'pending' for paid bookings.
--   • hide a review via admin_set_review_hidden; check rating_avg updates.
--   • upload to provider-media as the owning auth user; verify public read.
-- ============================================================
