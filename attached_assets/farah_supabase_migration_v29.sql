-- ============================================================
-- migration_v29: fix timezone bug in busy-interval RPCs
--
-- v6 and v28 both filtered with `(start_at)::date = day`. That cast
-- evaluates the timestamptz at the database's session timezone, which
-- on Supabase is UTC. For partial-day windows like a 7pm-8pm booking
-- that's fine — 7pm Riyadh = 4pm UTC, still on the same calendar day.
--
-- It BREAKS for "full day" blocks created from the unavailable manager:
-- a block from 00:00–23:59 local Riyadh is stored as 21:00 UTC the
-- previous day → 20:59 UTC of the picked day. The `(start_at)::date`
-- cast (in UTC) then returns the *previous* calendar day, so the
-- customer's query for "this day" silently misses the block and the
-- slot the provider tried to close is still offered.
--
-- The fix below replaces the `::date` predicate with a proper
-- timezone-aware range overlap against the Riyadh day window:
--
--     overlaps( riyadh_midnight, next_riyadh_midnight )
--
-- This is correct no matter whether the row was written in UTC or
-- local time, and no matter whether the database session timezone
-- shifts in the future.
--
-- Both `service_busy_intervals` (customer-facing) and
-- `provider_busy_intervals` (admin / calendar) are updated.
-- ============================================================

begin;

-- The constant timezone matches the customer base. If we later expand
-- outside the Kingdom we'll need to pass the provider's timezone in
-- from the application layer, but for now everyone is Asia/Riyadh.
-- Wrapping in a tiny SQL function lets us swap implementations later
-- without touching every RPC.
create or replace function public.app_tz()
returns text language sql immutable as $$
  select 'Asia/Riyadh'::text;
$$;

-- §1  service_busy_intervals (customer booking form) -------------
create or replace function public.service_busy_intervals(
  p_provider_id uuid,
  p_service_id  uuid,
  day           date
)
returns table(start_at timestamptz, end_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz         text        := public.app_tz();
  v_day_start  timestamptz := (day::text || ' 00:00')::timestamp at time zone v_tz;
  v_day_end    timestamptz := v_day_start + interval '1 day';
begin
  return query
  with raw as (
    -- Bookings on this specific service that overlap the local day.
    select
      date_trunc('minute', greatest(b.start_at, v_day_start)) as s,
      date_trunc('minute', least(b.end_at,    v_day_end))     as e
    from public.bookings b
    where b.provider_id = p_provider_id
      and b.service_id  = p_service_id
      and b.status in ('pending'::booking_status, 'accepted'::booking_status)
      and b.start_at < v_day_end
      and b.end_at   > v_day_start

    union all

    -- Provider-wide blocks (every service)
    select
      date_trunc('minute', greatest(u.start_at, v_day_start)),
      date_trunc('minute', least(u.end_at,    v_day_end))
    from public.provider_unavailable_periods u
    where u.provider_id = p_provider_id
      and u.service_id is null
      and u.start_at < v_day_end
      and u.end_at   > v_day_start

    union all

    -- Blocks pinned to this specific service
    select
      date_trunc('minute', greatest(u.start_at, v_day_start)),
      date_trunc('minute', least(u.end_at,    v_day_end))
    from public.provider_unavailable_periods u
    where u.provider_id = p_provider_id
      and u.service_id  = p_service_id
      and u.start_at < v_day_end
      and u.end_at   > v_day_start
  ),
  ordered as (
    select s, e from raw order by s
  ),
  with_prev as (
    select s, e, lag(e) over (order by s) as prev_e from ordered
  ),
  grouped as (
    select s, e,
      sum(case when s > coalesce(prev_e, '1970-01-01'::timestamptz) then 1 else 0 end)
        over (order by s) as grp
    from with_prev
  )
  select min(s), max(e)
  from grouped
  group by grp
  order by 1;
end $$;

revoke all on function public.service_busy_intervals(uuid, uuid, date) from public;
grant execute on function public.service_busy_intervals(uuid, uuid, date)
  to authenticated, anon;

-- §2  provider_busy_intervals (admin / calendar) -----------------
create or replace function public.provider_busy_intervals(
  p_id uuid,
  day  date
)
returns table(start_at timestamptz, end_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz         text        := public.app_tz();
  v_day_start  timestamptz := (day::text || ' 00:00')::timestamp at time zone v_tz;
  v_day_end    timestamptz := v_day_start + interval '1 day';
begin
  return query
  with raw as (
    select
      date_trunc('minute', greatest(b.start_at, v_day_start)) as s,
      date_trunc('minute', least(b.end_at,    v_day_end))     as e
    from public.bookings b
    where b.provider_id = p_id
      and b.status in ('pending'::booking_status, 'accepted'::booking_status)
      and b.start_at < v_day_end
      and b.end_at   > v_day_start
  ),
  ordered as (
    select s, e from raw order by s
  ),
  with_prev as (
    select s, e, lag(e) over (order by s) as prev_e from ordered
  ),
  grouped as (
    select s, e,
      sum(case when s > coalesce(prev_e, '1970-01-01'::timestamptz) then 1 else 0 end)
        over (order by s) as grp
    from with_prev
  )
  select min(s), max(e)
  from grouped
  group by grp
  order by 1;
end $$;

revoke all on function public.provider_busy_intervals(uuid, date) from public;
grant execute on function public.provider_busy_intervals(uuid, date)
  to authenticated, anon;

commit;
