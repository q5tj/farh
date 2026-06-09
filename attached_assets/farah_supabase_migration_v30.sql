-- ============================================================
-- migration_v30: per-provider Moyasar + new payment model
--
-- Architectural shift the project is making in v30 — v32:
--
--   OLD MODEL (v15 — v29):
--     Customer pays the deposit (25%) to the PLATFORM's Moyasar account.
--     Platform takes its app-share and queues a Payout to the provider's
--     IBAN. Final 75% is settled later (online / cash). All flows route
--     money through the platform.
--
--   NEW MODEL (v30+):
--     1. Each provider connects their OWN Moyasar account by pasting
--        their pk_live + sk_live into the provider zone.
--     2. The customer pays the FULL service price into that provider's
--        Moyasar account directly — no platform involvement on the
--        primary charge.
--     3. When the provider marks the service "completed" they owe the
--        platform a commission (`provider_commission` payment row),
--        calculated as `service_price * commission_rate`. The provider
--        settles it from their dashboard via a Moyasar invoice on the
--        PLATFORM's account.
--     4. Bookings can no longer be cancelled or refunded — only
--        rescheduled (v31). The platform never has to issue a refund
--        because it never received the customer's money in the first
--        place.
--     5. Providers who let their commission go overdue get warned,
--        then auto-suspended (v32). The T&Cs spell out the legal
--        consequence.
--
-- This migration only covers the foundation:
--   §1  providers gain Moyasar connection columns
--   §2  payments gains a `service_payment` kind for the new flow
--   §3  bookings gains `service_payment_id` for direct lookup
--   §4  app_settings: commission_rate now applies to FULL price, not
--       to the deposit. We deprecate deposit_percentage but leave the
--       row so existing data analysis keeps working.
--   §5  RPCs: create_service_payment_pending, compute_full_commission
--   §6  record_completion is rewritten to create the commission row
--       against the FULL price.
--
-- v31 will drop the cancel/refund pieces. v32 will add suspension.
-- Old columns (deposit_amount, deposit_paid_at, …) are kept for the
-- duration of v30 so existing bookings keep showing correctly during
-- the rollout. A later migration will drop them.
-- ============================================================

begin;

-- ============================================================
-- §1  providers: Moyasar connection columns
-- ============================================================
-- moyasar_status: where the provider is in the connection journey.
--   'not_connected' — fresh provider, no keys uploaded
--   'pending'       — keys uploaded, awaiting verify call
--   'active'        — keys verified against Moyasar API
--   'failed'        — verify returned 401/403 (typo / wrong env)
do $$ begin
  create type public.provider_moyasar_status as enum (
    'not_connected',
    'pending',
    'active',
    'failed'
  );
exception when duplicate_object then null; end $$;

alter table public.providers
  add column if not exists moyasar_publishable_key text,
  -- IMPORTANT: store this in Supabase Vault before going to production.
  -- The plain-text column below is a transitional storage during dev;
  -- the edge function reads it but the UI must never round-trip it back
  -- to the client. RLS hides it from everyone except service_role.
  add column if not exists moyasar_secret_key text,
  add column if not exists moyasar_status public.provider_moyasar_status
    not null default 'not_connected',
  add column if not exists moyasar_connected_at timestamptz,
  add column if not exists moyasar_last_error text;

create index if not exists idx_providers_moyasar_status
  on public.providers (moyasar_status);

-- Hide the secret key from anyone but service_role. The provider can
-- see/edit their own publishable_key + status via the existing
-- `providers_*_self` policies; the secret_key column is filtered out
-- of every SELECT by this column-level revoke.
revoke select (moyasar_secret_key) on public.providers from authenticated, anon;

-- ============================================================
-- §2  payments: add the new `service_payment` kind
-- ============================================================
-- We don't drop the old kinds — historical rows still need them. The
-- code will gradually stop creating booking_deposit / final_payment
-- rows once v30 is rolled out.
alter type public.payment_kind add value if not exists 'service_payment';

-- ============================================================
-- §3  bookings: pointer to the live service payment
-- ============================================================
alter table public.bookings
  add column if not exists service_payment_id uuid references public.payments(id) on delete set null,
  add column if not exists service_payment_status public.payment_status,
  add column if not exists service_paid_at timestamptz;

create index if not exists idx_bookings_service_payment_status
  on public.bookings (service_payment_status);

-- ============================================================
-- §4  app_settings: commission_rate now applies to FULL price
-- ============================================================
-- Reuse the existing commission_rate row but document the new meaning.
insert into public.app_settings (key, value)
values ('commission_rate', '10')
on conflict (key) do nothing;

-- ============================================================
-- §5  RPCs: full-payment + full-commission helpers
-- ============================================================

-- Compute the platform's commission for a booking using FULL service
-- price (not deposit). Returns SAR.
create or replace function public.compute_full_commission(p_booking_id uuid)
returns numeric
language sql stable
security definer
set search_path = public
as $$
  select round(
    b.price * coalesce(
      (select (value::text)::numeric from public.app_settings where key = 'commission_rate'),
      10
    ) / 100.0,
    2
  )
  from public.bookings b
  where b.id = p_booking_id;
$$;

-- Customer creates the pending payment row for the FULL service price.
-- Returns the new payment id. The edge function then calls Moyasar
-- using the PROVIDER's secret key (not the platform's).
create or replace function public.create_service_payment_pending(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_payment_id uuid;
begin
  select b.id, b.user_id, b.provider_id, b.price,
         b.service_payment_id, b.service_payment_status
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
    and b.user_id = (select id from public.users where auth_user_id = auth.uid());

  if v_booking is null then
    raise exception 'booking_not_found_or_forbidden';
  end if;

  if v_booking.service_payment_status = 'paid' then
    raise exception 'service_already_paid';
  end if;

  -- Reuse an in-flight pending row instead of stacking duplicates.
  if v_booking.service_payment_id is not null then
    select id into v_payment_id
    from public.payments
    where id = v_booking.service_payment_id
      and status in ('pending', 'initiated');
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  insert into public.payments (
    booking_id, user_id, provider_id, kind,
    amount_halalas, currency, description, status
  ) values (
    v_booking.id, v_booking.user_id, v_booking.provider_id,
    'service_payment'::payment_kind,
    round(v_booking.price * 100)::int,
    'SAR',
    'Service payment ' || v_booking.id::text,
    'pending'::payment_record_status
  )
  returning id into v_payment_id;

  update public.bookings
    set service_payment_id = v_payment_id,
        service_payment_status = 'pending'::payment_status
    where id = v_booking.id;

  return v_payment_id;
end $$;

grant execute on function public.create_service_payment_pending(uuid)
  to authenticated;

-- ============================================================
-- §6  record_completion: emit commission on FULL price
-- ============================================================
-- The old `record_completion(p_booking_id, p_method, p_note)` had a
-- branch for online vs cash settlement of the REMAINING 75%. The new
-- model has nothing remaining — the customer paid in full upfront. We
-- only need to (a) flip the booking to completed, (b) create a
-- commission payment row the provider can settle from the dashboard.
create or replace function public.record_completion(
  p_booking_id uuid,
  p_method     text default null,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking            record;
  v_provider_user_id   uuid;
  v_commission_sar     numeric;
  v_commission_halalas int;
  v_commission_id      uuid;
begin
  select b.id, b.provider_id, b.user_id, b.price, b.status,
         b.service_payment_status
  into v_booking
  from public.bookings b
  where b.id = p_booking_id;

  if v_booking is null then
    raise exception 'booking_not_found';
  end if;

  select p.user_id into v_provider_user_id
  from public.providers p
  where p.id = v_booking.provider_id;

  if v_provider_user_id is null
     or v_provider_user_id <> (select id from public.users where auth_user_id = auth.uid())
  then
    raise exception 'forbidden';
  end if;

  if v_booking.status <> 'accepted'::booking_status then
    raise exception 'booking_not_accepted';
  end if;

  if v_booking.service_payment_status is distinct from 'paid'::payment_status then
    raise exception 'service_not_paid';
  end if;

  -- Mark complete.
  update public.bookings
    set status = 'completed'::booking_status,
        completed_at = now()
    where id = v_booking.id;

  -- Create the platform commission row. The provider settles this
  -- from their dashboard. Amount = full price * commission_rate.
  v_commission_sar := public.compute_full_commission(v_booking.id);
  v_commission_halalas := round(v_commission_sar * 100)::int;

  insert into public.payments (
    booking_id, user_id, provider_id, kind,
    amount_halalas, currency, description, status
  ) values (
    v_booking.id, v_booking.user_id, v_booking.provider_id,
    'provider_commission'::payment_kind,
    v_commission_halalas,
    'SAR',
    'Platform commission ' || v_booking.id::text,
    'pending'::payment_record_status
  )
  returning id into v_commission_id;

  return jsonb_build_object(
    'method', 'commission_due',
    'remaining', 0,
    'commission_due', v_commission_sar,
    'commission_payment_id', v_commission_id,
    'final_payment_status', 'paid'
  );
end $$;

grant execute on function public.record_completion(uuid, text, text)
  to authenticated;

commit;
