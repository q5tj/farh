-- ============================================================
-- migration_v28: per-service availability
--
-- Before this migration:
--   • bookings_no_overlap excluded any overlapping booking on the SAME
--     provider, period. That made sense when a provider sold one thing
--     (a photographer, a band). It broke for providers who run multiple
--     concurrent services — a venue with three halls couldn't accept a
--     wedding in Hall A at 8pm if Hall B was already booked at 8pm.
--   • provider_busy_intervals(provider_id, date) returned the union of
--     EVERY service's busy windows. Customers booking Hall A saw Hall B
--     as busy.
--
-- This migration moves availability granularity to the service level:
--
--   §1  Drop the provider-wide overlap constraint, replace it with a
--       constraint that excludes overlapping bookings of the SAME
--       service_id. Different services of the same provider can now
--       overlap freely.
--
--   §2  New table `provider_unavailable_periods` lets providers block
--       arbitrary windows. `service_id` is nullable — NULL means "this
--       window blocks every service" (provider away for the day), a
--       specific id means "this window blocks only that hall/service"
--       (booked externally outside the platform).
--
--   §3  New RPC `service_busy_intervals(p_provider_id, p_service_id, day)`
--       merges bookings + unavailable_periods into a single sorted list
--       of merged windows. This is what the booking form will call once
--       the customer has chosen a specific service.
--
--   §4  Keep `provider_busy_intervals` as a back-compat alias for the
--       admin and provider calendar views that show every booking.
-- ============================================================

begin;

-- §1 ----------------------------------------------------------
alter table public.bookings
  drop constraint if exists bookings_no_overlap;

-- Replace with per-service overlap rule. service_id must be present
-- on every active booking (the booking form already requires it).
alter table public.bookings
  add constraint bookings_no_overlap_per_service
  exclude using gist (
    service_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (
    status in ('pending'::booking_status, 'accepted'::booking_status)
    and service_id is not null
  );

-- §2 ----------------------------------------------------------
create table if not exists public.provider_unavailable_periods (
  id          uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  -- nullable: NULL means block applies to every service the provider owns
  service_id  uuid references public.services(id) on delete cascade,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  reason      text,
  created_at  timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists idx_unavail_provider_time
  on public.provider_unavailable_periods (provider_id, start_at);
create index if not exists idx_unavail_service_time
  on public.provider_unavailable_periods (service_id, start_at)
  where service_id is not null;

alter table public.provider_unavailable_periods enable row level security;

-- Provider can manage their own blocks. Admin can manage every block.
drop policy if exists "unavail_select_own" on public.provider_unavailable_periods;
create policy "unavail_select_own" on public.provider_unavailable_periods
  for select using (
    provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "unavail_insert_own" on public.provider_unavailable_periods;
create policy "unavail_insert_own" on public.provider_unavailable_periods
  for insert with check (
    provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
  );

drop policy if exists "unavail_delete_own" on public.provider_unavailable_periods;
create policy "unavail_delete_own" on public.provider_unavailable_periods
  for delete using (
    provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
    or public.is_admin()
  );

-- Customers (anon for the slot generator) need to read the rows that
-- belong to the provider they're viewing — but ONLY through the RPC,
-- which is SECURITY DEFINER, so we don't have to widen the policy.
-- The RPC bypasses RLS by design.

-- §3 ----------------------------------------------------------
-- Service-scoped busy windows. Customer-facing: when booking Hall A,
-- caller passes service_id = Hall A. We then return the merged set of:
--   (a) other paid/pending bookings for Hall A on `day`
--   (b) unavailable_periods where service_id = Hall A on `day`
--   (c) unavailable_periods where service_id IS NULL on `day` (blocks
--       every service)
create or replace function public.service_busy_intervals(
  p_provider_id uuid,
  p_service_id  uuid,
  day           date
)
returns table(start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = public as $$
  with raw as (
    -- Other bookings on this service
    select
      date_trunc('minute', b.start_at) as s,
      date_trunc('minute', b.end_at)   as e
    from public.bookings b
    where b.provider_id = p_provider_id
      and b.service_id  = p_service_id
      and b.status in ('pending'::booking_status, 'accepted'::booking_status)
      and (b.start_at)::date = day

    union all

    -- Provider-wide blocks (apply to every service)
    select
      date_trunc('minute', u.start_at),
      date_trunc('minute', u.end_at)
    from public.provider_unavailable_periods u
    where u.provider_id = p_provider_id
      and u.service_id  is null
      and (u.start_at)::date = day

    union all

    -- Service-specific blocks
    select
      date_trunc('minute', u.start_at),
      date_trunc('minute', u.end_at)
    from public.provider_unavailable_periods u
    where u.provider_id = p_provider_id
      and u.service_id  = p_service_id
      and (u.start_at)::date = day
  ),
  with_prev as (
    select s, e, lag(e) over (order by s) as prev_e from raw
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

revoke all on function public.service_busy_intervals(uuid, uuid, date) from public;
grant execute on function public.service_busy_intervals(uuid, uuid, date)
  to authenticated, anon;

commit;
