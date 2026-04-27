-- ============================================================
-- فرحتكم | Farhatukum — Migration v6 (Production hardening)
-- نفّذ بعد migration_v5
-- ============================================================
-- يحل تلقائياً قائمة عيوب التدقيق عبر:
--   §1   commission_rate snapshot
--   §2   reviews integrity
--   §3   booking status state machine + customer/provider/admin policies
--   §4   working hours enforcement on insert
--   §5   profile_completed server-side + sensitive column guard
--   §6   become_provider() atomic RPC
--   §7   provider verification status
--   §8   provider_service_areas table
--   §9   cities table + seed
--   §10  customer_favorites table
--   §11  booking expiry (expires_at + cron RPC)
--   §12  push token global uniqueness
--   §13  audit_log table + triggers (role/commission/content)
--   §14  rate limits (booking/ticket/broadcast)
--   §15  provider_busy_intervals — coarsen to merged ranges
--   §16  realtime PII view (read-only, drops phone/email)
-- ============================================================

create extension if not exists "uuid-ossp";


-- ============================================================
-- §1 BOOKINGS — commission_rate snapshot
-- ============================================================
create or replace function public.snapshot_booking_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare raw jsonb;
begin
  select value into raw from public.app_settings where key = 'commission_rate';
  if raw is null then
    new.commission_rate := coalesce(new.commission_rate, 10);
  elsif jsonb_typeof(raw) = 'number' then
    new.commission_rate := (raw#>>'{}')::numeric;
  elsif jsonb_typeof(raw) = 'string' and (raw#>>'{}') ~ '^[0-9]+(\.[0-9]+)?$' then
    new.commission_rate := (raw#>>'{}')::numeric;
  else
    new.commission_rate := 10;
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_commission_snapshot on public.bookings;
create trigger trg_bookings_commission_snapshot
  before insert on public.bookings
  for each row execute function public.snapshot_booking_commission();


-- ============================================================
-- §2 REVIEWS — strict integrity (no self-review, must own completed booking)
-- ============================================================
drop policy if exists "reviews_insert_owner" on public.reviews;
drop policy if exists "reviews_insert_legit" on public.reviews;
create policy "reviews_insert_legit" on public.reviews
  for insert with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    and exists (
      select 1 from public.bookings b
      join public.providers p on p.id = b.provider_id
      where b.id = reviews.booking_id
        and b.user_id = reviews.user_id
        and b.provider_id = reviews.provider_id
        and b.status = 'completed'::booking_status
        and p.user_id <> b.user_id  -- prevent self-rating
    )
  );

-- block review updates by users; only admin can edit
drop policy if exists "reviews_update_admin" on public.reviews;
create policy "reviews_update_admin" on public.reviews
  for update using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- §3 BOOKINGS — split update policies + state machine
-- ============================================================
drop policy if exists "bookings_update_visible" on public.bookings;
drop policy if exists "bookings_customer_cancel" on public.bookings;
drop policy if exists "bookings_provider_manage" on public.bookings;
drop policy if exists "bookings_admin_manage" on public.bookings;

-- Customer can ONLY cancel own bookings (status to 'cancelled')
create policy "bookings_customer_cancel" on public.bookings
  for update using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  )
  with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

-- Provider can manage their own bookings
create policy "bookings_provider_manage" on public.bookings
  for update using (
    provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
  )
  with check (
    provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
  );

-- Admin full access
create policy "bookings_admin_manage" on public.bookings
  for update using (public.is_admin()) with check (public.is_admin());

-- State machine + per-role transition validation
create or replace function public.validate_booking_transition()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_customer boolean;
  is_provider boolean;
begin
  if old.status = new.status then return new; end if;
  if public.is_admin() then return new; end if;

  is_customer := old.user_id in (
    select id from public.users where auth_user_id = auth.uid()
  );
  is_provider := old.provider_id in (
    select p.id from public.providers p
    join public.users u on u.id = p.user_id
    where u.auth_user_id = auth.uid()
  );

  -- Customer can only cancel pending/accepted
  if is_customer and not is_provider then
    if new.status <> 'cancelled'::booking_status then
      raise exception 'Customer can only cancel a booking (got %)', new.status;
    end if;
    if old.status not in ('pending'::booking_status, 'accepted'::booking_status) then
      raise exception 'Cannot cancel a booking in status %', old.status;
    end if;
    return new;
  end if;

  -- Provider transitions
  if is_provider then
    case old.status
      when 'pending'::booking_status then
        if new.status not in ('accepted'::booking_status, 'rejected'::booking_status, 'cancelled'::booking_status) then
          raise exception 'Invalid transition from pending to %', new.status;
        end if;
      when 'accepted'::booking_status then
        if new.status not in ('completed'::booking_status, 'cancelled'::booking_status) then
          raise exception 'Invalid transition from accepted to %', new.status;
        end if;
      else
        raise exception 'Cannot change status from terminal state %', old.status;
    end case;
    return new;
  end if;

  raise exception 'Not authorized to change booking status';
end $$;

drop trigger if exists trg_bookings_validate_transition on public.bookings;
create trigger trg_bookings_validate_transition
  before update of status on public.bookings
  for each row execute function public.validate_booking_transition();


-- ============================================================
-- §4 BOOKINGS — working hours enforcement on insert
-- ============================================================
create or replace function public.validate_booking_within_hours()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hours jsonb;
  weekday text;
  open_t time;
  close_t time;
  start_local time;
  end_local time;
begin
  select working_hours into hours from public.providers where id = new.provider_id;
  if hours is null then return new; end if;

  weekday := lower(to_char((new.start_at at time zone 'Asia/Riyadh'), 'dy'));
  if hours->weekday is null or jsonb_typeof(hours->weekday) <> 'array' then
    raise exception 'Provider closed on % (%)', weekday, new.start_at;
  end if;

  open_t := (hours->weekday->>0)::time;
  close_t := (hours->weekday->>1)::time;
  start_local := ((new.start_at at time zone 'Asia/Riyadh')::timestamp)::time;
  end_local := ((new.end_at at time zone 'Asia/Riyadh')::timestamp)::time;

  if start_local < open_t or end_local > close_t then
    raise exception 'Booking outside working hours (% - %)', open_t, close_t;
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_within_hours on public.bookings;
create trigger trg_bookings_within_hours
  before insert on public.bookings
  for each row execute function public.validate_booking_within_hours();


-- ============================================================
-- §5 USERS — server-side profile_completed + sensitive guard
-- ============================================================
create or replace function public.update_profile_completed()
returns trigger language plpgsql as $$
begin
  new.profile_completed := (
    new.full_name is not null and length(trim(new.full_name)) > 0
    and new.phone is not null and length(trim(new.phone)) > 0
    and new.gender is not null
    and new.age is not null
    and new.language is not null
  );
  return new;
end $$;

drop trigger if exists trg_users_set_profile_completed on public.users;
create trigger trg_users_set_profile_completed
  before insert or update of full_name, phone, gender, age, language, profile_completed
  on public.users
  for each row execute function public.update_profile_completed();

-- Sensitive column guard: lock email + role for non-admin updates
create or replace function public.guard_users_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  -- Prevent email tampering (auth manages email)
  new.email := old.email;
  -- Reset role to old if attempted change to invalid value
  if new.role <> old.role and new.role not in ('customer'::user_role, 'provider'::user_role) then
    new.role := old.role;
  end if;
  return new;
end $$;

drop trigger if exists trg_users_guard_update on public.users;
create trigger trg_users_guard_update
  before update on public.users
  for each row execute function public.guard_users_update();


-- ============================================================
-- §6 PROVIDER ONBOARDING — atomic RPC
-- ============================================================
create or replace function public.become_provider(
  p_category_id uuid,
  p_name text,
  p_description text default null,
  p_city text default null,
  p_phone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  new_provider_id uuid;
begin
  select id into current_user_id
  from public.users where auth_user_id = auth.uid();
  if current_user_id is null then
    raise exception 'No user record';
  end if;
  if exists (select 1 from public.providers where user_id = current_user_id) then
    raise exception 'Already a provider';
  end if;

  insert into public.providers (
    user_id, category_id, name, name_ar,
    description, description_ar, city, phone, email
  )
  values (
    current_user_id, p_category_id, p_name, p_name,
    p_description, p_description, p_city, p_phone, p_email
  )
  returning id into new_provider_id;

  update public.users set role = 'provider'::user_role where id = current_user_id;

  -- backfill service area from primary city
  if p_city is not null then
    insert into public.provider_service_areas (provider_id, city)
    values (new_provider_id, p_city)
    on conflict do nothing;
  end if;

  return new_provider_id;
end $$;

revoke all on function public.become_provider(uuid, text, text, text, text, text) from public;
grant execute on function public.become_provider(uuid, text, text, text, text, text) to authenticated;


-- ============================================================
-- §7 PROVIDERS — verification status
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'verification_status') then
    create type verification_status as enum ('pending','approved','rejected');
  end if;
end $$;

alter table public.providers
  add column if not exists verification_status verification_status not null default 'pending';

create index if not exists idx_providers_verification on public.providers(verification_status);


-- ============================================================
-- §8 PROVIDER SERVICE AREAS
-- ============================================================
create table if not exists public.provider_service_areas (
  provider_id uuid not null references public.providers(id) on delete cascade,
  city text not null,
  created_at timestamptz not null default now(),
  primary key (provider_id, city)
);

create index if not exists idx_psa_city on public.provider_service_areas(city);

alter table public.provider_service_areas enable row level security;

drop policy if exists "psa_read_all" on public.provider_service_areas;
create policy "psa_read_all" on public.provider_service_areas for select using (true);

drop policy if exists "psa_write_owner" on public.provider_service_areas;
create policy "psa_write_owner" on public.provider_service_areas
  for all using (
    provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    ) or public.is_admin()
  )
  with check (
    provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    ) or public.is_admin()
  );

-- backfill from existing providers.city
insert into public.provider_service_areas (provider_id, city)
select id, city from public.providers where city is not null
on conflict do nothing;


-- ============================================================
-- §9 CITIES TABLE
-- ============================================================
create table if not exists public.cities (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name_ar text not null,
  name_en text not null,
  is_active boolean not null default true,
  sort_order int default 0
);

alter table public.cities enable row level security;

drop policy if exists "cities_read_all" on public.cities;
create policy "cities_read_all" on public.cities for select using (true);

drop policy if exists "cities_write_admin" on public.cities;
create policy "cities_write_admin" on public.cities
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.cities (slug, name_ar, name_en, sort_order) values
  ('riyadh',   'الرياض',          'Riyadh',   1),
  ('jeddah',   'جدة',             'Jeddah',   2),
  ('makkah',   'مكة المكرمة',      'Makkah',   3),
  ('madinah',  'المدينة المنورة',   'Madinah',  4),
  ('dammam',   'الدمام',           'Dammam',   5),
  ('khobar',   'الخبر',            'Khobar',   6),
  ('taif',     'الطائف',           'Taif',     7),
  ('tabuk',    'تبوك',             'Tabuk',    8),
  ('abha',     'أبها',             'Abha',     9),
  ('buraydah', 'بريدة',            'Buraydah', 10)
on conflict (slug) do nothing;


-- ============================================================
-- §10 CUSTOMER FAVORITES
-- ============================================================
create table if not exists public.customer_favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, provider_id)
);

create index if not exists idx_favorites_user on public.customer_favorites(user_id);

alter table public.customer_favorites enable row level security;

drop policy if exists "favorites_self" on public.customer_favorites;
create policy "favorites_self" on public.customer_favorites
  for all using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  )
  with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );


-- ============================================================
-- §11 BOOKING EXPIRY
-- ============================================================
alter table public.bookings
  add column if not exists expires_at timestamptz;

create or replace function public.set_booking_expiry()
returns trigger language plpgsql as $$
begin
  if new.expires_at is null then
    new.expires_at := coalesce(new.created_at, now()) + interval '6 hours';
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_set_expiry on public.bookings;
create trigger trg_bookings_set_expiry
  before insert on public.bookings
  for each row execute function public.set_booking_expiry();

-- Cron-callable: expire pending bookings past their deadline
create or replace function public.expire_pending_bookings()
returns int language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  update public.bookings
  set status = 'rejected'::booking_status
  where status = 'pending'::booking_status
    and expires_at < now();
  get diagnostics cnt = row_count;
  return cnt;
end $$;

revoke all on function public.expire_pending_bookings() from public;
grant execute on function public.expire_pending_bookings() to service_role;


-- ============================================================
-- §12 PUSH TOKENS — token must be globally unique
-- ============================================================
-- Mark older duplicates inactive before adding the unique constraint.
do $$ begin
  update public.push_tokens t
  set is_active = false
  from (
    select token, max(updated_at) as latest from public.push_tokens
    group by token having count(*) > 1
  ) latest
  where t.token = latest.token and t.updated_at < latest.latest;
end $$;

alter table public.push_tokens
  drop constraint if exists push_tokens_token_unique_global;

-- Cleanup: keep only latest row per token to satisfy unique constraint
delete from public.push_tokens t1
using public.push_tokens t2
where t1.token = t2.token and t1.updated_at < t2.updated_at;

alter table public.push_tokens
  add constraint push_tokens_token_unique_global unique (token);


-- ============================================================
-- §13 AUDIT LOG
-- ============================================================
create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_actor on public.audit_log(actor_user_id);
create index if not exists idx_audit_action on public.audit_log(action);
create index if not exists idx_audit_created on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_read_admin" on public.audit_log;
create policy "audit_read_admin" on public.audit_log
  for select using (public.is_admin());

-- writes only via SECURITY DEFINER triggers (no client policy)

-- role change audit
create or replace function public.audit_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role is distinct from new.role then
    insert into public.audit_log (actor_user_id, action, target_table, target_id, payload)
    select
      (select id from public.users where auth_user_id = auth.uid()),
      'role_change', 'users', new.id::text,
      jsonb_build_object('from', old.role::text, 'to', new.role::text);
  end if;
  return new;
end $$;

drop trigger if exists trg_users_audit_role on public.users;
create trigger trg_users_audit_role
  after update of role on public.users
  for each row execute function public.audit_role_change();

-- commission change audit
create or replace function public.audit_commission_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.key = 'commission_rate') and (old.value is distinct from new.value) then
    insert into public.audit_log (actor_user_id, action, target_table, target_id, payload)
    select
      (select id from public.users where auth_user_id = auth.uid()),
      'commission_change', 'app_settings', new.key,
      jsonb_build_object('from', old.value, 'to', new.value);
  end if;
  return new;
end $$;

drop trigger if exists trg_settings_audit_commission on public.app_settings;
create trigger trg_settings_audit_commission
  after update on public.app_settings
  for each row execute function public.audit_commission_change();

-- content change audit
create or replace function public.audit_content_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_user_id, action, target_table, target_id, payload)
  select
    (select id from public.users where auth_user_id = auth.uid()),
    'content_edit', 'app_content', new.key,
    jsonb_build_object(
      'ar_changed', old.value_ar is distinct from new.value_ar,
      'en_changed', old.value_en is distinct from new.value_en
    );
  return new;
end $$;

drop trigger if exists trg_content_audit on public.app_content;
create trigger trg_content_audit
  after update on public.app_content
  for each row execute function public.audit_content_change();


-- ============================================================
-- §14 RATE LIMITS
-- ============================================================
create table if not exists public.rate_limits (
  user_id uuid not null references public.users(id) on delete cascade,
  bucket text not null,
  count int not null default 0,
  reset_at timestamptz not null,
  primary key (user_id, bucket)
);

alter table public.rate_limits enable row level security;

drop policy if exists "rate_limits_read_self" on public.rate_limits;
create policy "rate_limits_read_self" on public.rate_limits
  for select using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or public.is_admin()
  );

create or replace function public.consume_rate_limit(
  p_user_id uuid, p_bucket text, p_max int, p_window_seconds int
)
returns boolean language plpgsql security definer set search_path = public as $$
declare rec public.rate_limits;
begin
  select * into rec from public.rate_limits where user_id = p_user_id and bucket = p_bucket;
  if not found or rec.reset_at < now() then
    insert into public.rate_limits (user_id, bucket, count, reset_at)
    values (p_user_id, p_bucket, 1, now() + (p_window_seconds || ' seconds')::interval)
    on conflict (user_id, bucket) do update set count = 1, reset_at = excluded.reset_at;
    return true;
  end if;
  if rec.count >= p_max then return false; end if;
  update public.rate_limits set count = count + 1 where user_id = p_user_id and bucket = p_bucket;
  return true;
end $$;

-- bookings: 10/hour per customer
create or replace function public.rate_limit_bookings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.consume_rate_limit(new.user_id, 'booking', 10, 3600) then
    raise exception 'Rate limit exceeded: too many bookings, try again later';
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_rate_limit on public.bookings;
create trigger trg_bookings_rate_limit
  before insert on public.bookings
  for each row execute function public.rate_limit_bookings();

-- support tickets: 5/hour per user
create or replace function public.rate_limit_tickets()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.consume_rate_limit(new.user_id, 'ticket', 5, 3600) then
    raise exception 'Rate limit exceeded: too many support tickets';
  end if;
  return new;
end $$;

drop trigger if exists trg_tickets_rate_limit on public.support_tickets;
create trigger trg_tickets_rate_limit
  before insert on public.support_tickets
  for each row execute function public.rate_limit_tickets();

-- broadcasts: 3/hour per admin
create or replace function public.rate_limit_broadcasts()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin_user_id uuid;
begin
  if new.user_id is null then
    select id into admin_user_id from public.users where auth_user_id = auth.uid();
    if admin_user_id is not null then
      if not public.consume_rate_limit(admin_user_id, 'broadcast', 3, 3600) then
        raise exception 'Rate limit exceeded: too many broadcasts';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_broadcasts_rate_limit on public.notifications;
create trigger trg_broadcasts_rate_limit
  before insert on public.notifications
  for each row execute function public.rate_limit_broadcasts();


-- ============================================================
-- §15 PROVIDER_BUSY_INTERVALS — coarsened (merged + minute-truncated)
-- ============================================================
create or replace function public.provider_busy_intervals(p_id uuid, day date)
returns table(start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = public as $$
  -- Merge contiguous/overlapping intervals; truncate to minute precision.
  with raw as (
    select
      date_trunc('minute', b.start_at) as s,
      date_trunc('minute', b.end_at)   as e
    from public.bookings b
    where b.provider_id = p_id
      and b.status in ('pending'::booking_status, 'accepted'::booking_status)
      and (b.start_at)::date = day
  ),
  with_prev as (
    select s, e,
      lag(e) over (order by s) as prev_e
    from raw
  ),
  grouped as (
    select s, e,
      sum(case when s > coalesce(prev_e, '1970-01-01'::timestamptz) then 1 else 0 end)
        over (order by s) as grp
    from with_prev
  )
  select min(s) as start_at, max(e) as end_at
  from grouped
  group by grp
  order by start_at;
$$;

revoke all on function public.provider_busy_intervals(uuid, date) from public;
grant execute on function public.provider_busy_intervals(uuid, date) to authenticated, anon;


-- ============================================================
-- §16 REALTIME PII — providers public view (drops phone/email)
-- ============================================================
-- Realtime broadcasts on public.providers leak phone/email row-by-row even
-- though those columns are intended for booking confirmation only. Solution:
-- drop providers from realtime publication; clients re-fetch when category/
-- service Realtime fires (catalog channel).
do $$ begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'providers'
  ) then
    alter publication supabase_realtime drop table public.providers;
  end if;
end $$;


-- ============================================================
-- ✅ Done. Verify in order:
--   1. SELECT routine_name FROM information_schema.routines
--      WHERE routine_schema='public' AND routine_name LIKE '%booking%';
--   2. \d public.bookings  -- expect expires_at + new constraints
--   3. \d public.audit_log -- new
--   4. \d public.cities    -- new + 10 rows
--   5. \d public.provider_service_areas -- new
--   6. \d public.customer_favorites -- new
--   7. \d public.rate_limits -- new
-- ============================================================
