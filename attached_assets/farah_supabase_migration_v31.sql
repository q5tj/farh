-- ============================================================
-- migration_v31: replace cancel/refund with reschedule
--
-- The new business model (see v30 header) routes the customer's payment
-- straight to the provider's Moyasar account. The platform never sees
-- the money, so it can't issue a refund. To keep this safe for the
-- customer we replace the cancel/refund path with a *reschedule* path:
--
--   • Customer can move a booking to another date/time as long as the
--     original starts > 48h from now (cut-off window prevents abuse
--     and gives the provider time to plan).
--   • The new time must pass the same slot-availability check the
--     original booking went through (`service_busy_intervals`), so we
--     never double-book the provider.
--   • The provider must accept the reschedule before it takes effect.
--   • Every reschedule is appended to `booking_reschedules` so we have
--     an audit trail for disputes.
--
-- This migration:
--   §1  Drops the cancel RPC and the cancel-related columns from
--       bookings (we replace the columns with the audit table).
--   §2  Adds `rescheduled_from_at`, `reschedule_count`,
--       `reschedule_status` on bookings.
--   §3  New `booking_reschedules` audit table.
--   §4  New RPCs:
--         request_reschedule(booking_id, new_start, new_end)
--           — customer requests a move. Validates window + slot.
--         accept_reschedule(reschedule_id)
--           — provider accepts. Booking start/end are updated.
--         reject_reschedule(reschedule_id, reason)
--   §5  Constant `reschedule_minimum_hours` in app_settings.
-- ============================================================

begin;

-- ============================================================
-- §1  drop the cancel surface
-- ============================================================
-- We don't drop the columns yet — they hold historical data for
-- bookings cancelled before v31. We just stop the app from writing
-- to them by removing the RPC and the related triggers. A future
-- maintenance migration can archive them.
drop function if exists public.cancel_booking(uuid, text);
drop function if exists public.request_refund(uuid);

-- ============================================================
-- §2  bookings: reschedule columns
-- ============================================================
do $$ begin
  create type public.reschedule_status as enum (
    'none',     -- never rescheduled
    'pending',  -- customer requested, provider hasn't decided
    'accepted', -- provider accepted, booking start/end updated
    'rejected'  -- provider declined; booking stays at original time
  );
exception when duplicate_object then null; end $$;

alter table public.bookings
  add column if not exists rescheduled_from_at  timestamptz,
  add column if not exists reschedule_count     int not null default 0,
  add column if not exists reschedule_status    public.reschedule_status
    not null default 'none';

-- ============================================================
-- §3  audit table
-- ============================================================
create table if not exists public.booking_reschedules (
  id                uuid primary key default uuid_generate_v4(),
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  requested_by      uuid not null references public.users(id) on delete cascade,
  previous_start_at timestamptz not null,
  previous_end_at   timestamptz not null,
  new_start_at      timestamptz not null,
  new_end_at        timestamptz not null,
  status            public.reschedule_status not null default 'pending',
  reason            text,
  decided_by        uuid references public.users(id),
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  check (new_end_at > new_start_at)
);

create index if not exists idx_reschedule_booking
  on public.booking_reschedules (booking_id, created_at desc);
create index if not exists idx_reschedule_status
  on public.booking_reschedules (status) where status = 'pending';

alter table public.booking_reschedules enable row level security;

-- Customer + provider on the booking can see, customer creates,
-- provider decides. Admin sees everything.
drop policy if exists "reschedule_select_party" on public.booking_reschedules;
create policy "reschedule_select_party" on public.booking_reschedules
  for select using (
    exists (
      select 1 from public.bookings b
      join public.users u on u.id = b.user_id
      where b.id = booking_reschedules.booking_id
        and u.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.bookings b
      join public.providers p on p.id = b.provider_id
      join public.users u on u.id = p.user_id
      where b.id = booking_reschedules.booking_id
        and u.auth_user_id = auth.uid()
    )
    or public.is_admin()
  );

-- ============================================================
-- §4  RPCs
-- ============================================================

-- Customer requests a new time. Validates:
--   • The booking is owned by the caller.
--   • The booking is still in a state that allows rescheduling
--     (pending or accepted, not completed/cancelled).
--   • The current start is at least `reschedule_minimum_hours` in
--     the future. The customer can't pull the rug out from under the
--     provider at the last minute.
--   • The new window doesn't collide with any existing booking or
--     unavailable_period on the same service (uses the same overlap
--     logic as the customer-side booking form).
create or replace function public.request_reschedule(
  p_booking_id  uuid,
  p_new_start   timestamptz,
  p_new_end     timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking        record;
  v_caller_user_id uuid;
  v_minimum_hours  int;
  v_reschedule_id  uuid;
begin
  select id into v_caller_user_id
  from public.users
  where auth_user_id = auth.uid();

  if v_caller_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select b.id, b.user_id, b.provider_id, b.service_id,
         b.start_at, b.end_at, b.status, b.reschedule_status,
         b.reschedule_count
  into v_booking
  from public.bookings b
  where b.id = p_booking_id;

  if v_booking is null then
    raise exception 'booking_not_found';
  end if;

  if v_booking.user_id <> v_caller_user_id then
    raise exception 'forbidden';
  end if;

  if v_booking.status not in ('pending'::booking_status, 'accepted'::booking_status) then
    raise exception 'booking_not_reschedulable';
  end if;

  if v_booking.reschedule_status = 'pending' then
    raise exception 'reschedule_already_pending';
  end if;

  -- Cut-off: minimum hours between now and the existing start.
  v_minimum_hours := coalesce(
    (select (value::text)::int from public.app_settings where key = 'reschedule_minimum_hours'),
    48
  );
  if v_booking.start_at - now() < make_interval(hours => v_minimum_hours) then
    raise exception 'reschedule_too_late';
  end if;

  if p_new_end <= p_new_start then
    raise exception 'invalid_time_range';
  end if;

  -- The new time must not collide. We check the SAME way the booking
  -- form does — exclude the current booking from the collision check
  -- so the customer can't "collide with itself".
  if exists (
    select 1 from public.bookings b
    where b.provider_id = v_booking.provider_id
      and b.service_id  = v_booking.service_id
      and b.id          <> v_booking.id
      and b.status in ('pending'::booking_status, 'accepted'::booking_status)
      and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_new_start, p_new_end, '[)')
  ) then
    raise exception 'slot_taken';
  end if;

  if exists (
    select 1 from public.provider_unavailable_periods u
    where u.provider_id = v_booking.provider_id
      and (u.service_id is null or u.service_id = v_booking.service_id)
      and tstzrange(u.start_at, u.end_at, '[)') && tstzrange(p_new_start, p_new_end, '[)')
  ) then
    raise exception 'slot_blocked_by_provider';
  end if;

  insert into public.booking_reschedules (
    booking_id, requested_by,
    previous_start_at, previous_end_at,
    new_start_at, new_end_at
  ) values (
    v_booking.id, v_caller_user_id,
    v_booking.start_at, v_booking.end_at,
    p_new_start, p_new_end
  )
  returning id into v_reschedule_id;

  update public.bookings
    set reschedule_status = 'pending'::reschedule_status
    where id = v_booking.id;

  return v_reschedule_id;
end $$;

grant execute on function public.request_reschedule(uuid, timestamptz, timestamptz)
  to authenticated;

-- Provider accepts. Moves the booking, increments the count, records
-- the decision. The collision check runs AGAIN at accept-time because
-- the slot might have been taken in the gap between request and accept.
create or replace function public.accept_reschedule(p_reschedule_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reschedule  record;
  v_booking     record;
  v_caller_uid  uuid;
begin
  select id into v_caller_uid from public.users where auth_user_id = auth.uid();
  if v_caller_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_reschedule from public.booking_reschedules
    where id = p_reschedule_id and status = 'pending';
  if v_reschedule is null then raise exception 'reschedule_not_pending'; end if;

  select b.* into v_booking from public.bookings b where b.id = v_reschedule.booking_id;
  if v_booking is null then raise exception 'booking_not_found'; end if;

  -- Provider check
  if not exists (
    select 1 from public.providers p
    where p.id = v_booking.provider_id and p.user_id = v_caller_uid
  ) then
    raise exception 'forbidden';
  end if;

  -- Recheck collision
  if exists (
    select 1 from public.bookings b
    where b.provider_id = v_booking.provider_id
      and b.service_id  = v_booking.service_id
      and b.id          <> v_booking.id
      and b.status in ('pending'::booking_status, 'accepted'::booking_status)
      and tstzrange(b.start_at, b.end_at, '[)')
          && tstzrange(v_reschedule.new_start_at, v_reschedule.new_end_at, '[)')
  ) then
    raise exception 'slot_taken_meanwhile';
  end if;

  update public.bookings
    set start_at = v_reschedule.new_start_at,
        end_at   = v_reschedule.new_end_at,
        rescheduled_from_at = v_reschedule.previous_start_at,
        reschedule_count    = v_booking.reschedule_count + 1,
        reschedule_status   = 'accepted'::reschedule_status
    where id = v_booking.id;

  update public.booking_reschedules
    set status     = 'accepted'::reschedule_status,
        decided_by = v_caller_uid,
        decided_at = now()
    where id = p_reschedule_id;
end $$;

grant execute on function public.accept_reschedule(uuid) to authenticated;

create or replace function public.reject_reschedule(
  p_reschedule_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reschedule  record;
  v_booking     record;
  v_caller_uid  uuid;
begin
  select id into v_caller_uid from public.users where auth_user_id = auth.uid();
  if v_caller_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_reschedule from public.booking_reschedules
    where id = p_reschedule_id and status = 'pending';
  if v_reschedule is null then raise exception 'reschedule_not_pending'; end if;

  select b.* into v_booking from public.bookings b where b.id = v_reschedule.booking_id;
  if not exists (
    select 1 from public.providers p
    where p.id = v_booking.provider_id and p.user_id = v_caller_uid
  ) then
    raise exception 'forbidden';
  end if;

  update public.booking_reschedules
    set status     = 'rejected'::reschedule_status,
        decided_by = v_caller_uid,
        decided_at = now(),
        reason     = p_reason
    where id = p_reschedule_id;

  update public.bookings
    set reschedule_status = 'rejected'::reschedule_status
    where id = v_booking.id;
end $$;

grant execute on function public.reject_reschedule(uuid, text) to authenticated;

-- ============================================================
-- §5  default cut-off window
-- ============================================================
insert into public.app_settings (key, value)
values ('reschedule_minimum_hours', '48')
on conflict (key) do nothing;

commit;
