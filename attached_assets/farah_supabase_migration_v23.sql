-- ============================================================
-- migration_v23: Moyasar Payouts API integration (feature-flagged)
--
-- Adds the infrastructure to automatically transfer the provider's
-- share to their IBAN via Moyasar's Payouts API (POST /payouts) as
-- soon as the customer payment is confirmed. The actual API call
-- lives in the `moyasar` Edge Function (action: create-payout).
--
-- The whole flow is gated by `app_settings.moyasar_payouts_enabled`
-- so the code can be deployed before the merchant has Moyasar's
-- Payouts API access. While the flag is `false`, every confirmed
-- deposit / final-payment still enqueues a `provider_payouts` row
-- with status='manual_pending' so the admin can settle by hand.
--
-- Changes:
--   §1  Extend `provider_payouts` (added in v16) with booking link,
--        moyasar payout id, status, and payout_type fields.
--   §2  Add `moyasar_payouts_enabled` flag to app_settings.
--   §3  Helper RPC `enqueue_provider_payout(booking_id, payout_type)`
--        that computes the amount + inserts a queued row.
--   §4  Hook into mark_payment_paid: whenever a booking_deposit or
--        final_payment flips to paid, enqueue a payout row.
--   §5  RLS — admin reads everything, providers read their own.
-- ============================================================

begin;

-- ============================================================
-- §1  Extend provider_payouts
-- ============================================================
alter table public.provider_payouts
  add column if not exists booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists payout_type text check (
    payout_type is null or payout_type in (
      'deposit_share',   -- provider's share of the deposit
      'final_share',     -- provider's share of the final online payment
      'manual'           -- admin-recorded settlement (cash / bank transfer outside Moyasar)
    )
  ),
  add column if not exists status text not null default 'manual_pending' check (
    status in (
      'manual_pending',  -- payouts API disabled; admin must settle manually
      'queued',          -- ready for the next process-payouts run
      'initiated',       -- Moyasar accepted the payout request
      'completed',       -- Moyasar reports the payout finished
      'failed',          -- Moyasar rejected or the transfer failed
      'cancelled'        -- admin cancelled before processing
    )
  ),
  add column if not exists moyasar_payout_id text unique,
  add column if not exists failure_reason text,
  add column if not exists initiated_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists processed_by uuid references public.users(id) on delete set null;

create index if not exists idx_provider_payouts_status
  on public.provider_payouts(status);
create index if not exists idx_provider_payouts_booking
  on public.provider_payouts(booking_id);

-- ============================================================
-- §2  Settings flag (default OFF — admin flips it once Moyasar
--      enables the Payouts API on the merchant account)
-- ============================================================
insert into public.app_settings (key, value)
values ('moyasar_payouts_enabled', 'false'::jsonb)
on conflict (key) do nothing;

-- ============================================================
-- §3  enqueue_provider_payout — called by mark_payment_paid (§4)
-- ============================================================
create or replace function public.enqueue_provider_payout(
  p_booking_id uuid,
  p_payout_type text,
  p_amount_halalas integer
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_booking record;
  v_enabled boolean;
  v_payout_id uuid;
  v_initial_status text;
begin
  -- Skip zero / negative amounts (e.g. deposit fully consumed by app share).
  if p_amount_halalas is null or p_amount_halalas <= 0 then
    return null;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then return null; end if;
  if v_booking.provider_id is null then return null; end if;

  -- Check the feature flag to pick the initial status. The actual API
  -- call still happens later from the Edge Function — this RPC only
  -- creates the bookkeeping row.
  select coalesce((value::text)::boolean, false) into v_enabled
    from public.app_settings where key = 'moyasar_payouts_enabled';
  v_initial_status := case when coalesce(v_enabled, false)
                            then 'queued'
                            else 'manual_pending' end;

  -- Idempotency: skip if we've already enqueued a payout for this
  -- (booking, type) tuple. Useful in case the trigger fires twice on
  -- a race-y double webhook.
  if exists (
    select 1 from public.provider_payouts
    where booking_id = p_booking_id and payout_type = p_payout_type
  ) then
    return null;
  end if;

  insert into public.provider_payouts (
    provider_id, booking_id, payout_type,
    amount_halalas, status, method, note
  ) values (
    v_booking.provider_id, p_booking_id, p_payout_type,
    p_amount_halalas, v_initial_status,
    case when v_initial_status = 'queued' then 'moyasar' else null end,
    null
  )
  returning id into v_payout_id;

  return v_payout_id;
end $$;

grant execute on function public.enqueue_provider_payout(uuid, text, integer) to authenticated;
grant execute on function public.enqueue_provider_payout(uuid, text, integer) to service_role;

-- ============================================================
-- §4  Hook into mark_payment_paid
--      When a booking_deposit or final_payment row flips to paid,
--      enqueue a payout for the provider's net share.
-- ============================================================
create or replace function public.mark_payment_paid(
  p_payment_id uuid,
  p_moyasar_id text,
  p_moyasar_status text,
  p_source jsonb
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_payment record;
begin
  update public.payments
    set status = 'paid',
        moyasar_id = coalesce(p_moyasar_id, moyasar_id),
        moyasar_status = p_moyasar_status,
        moyasar_source = p_source,
        paid_at = now()
  where id = p_payment_id
    and status in ('pending', 'initiated')
  returning * into v_payment;

  if not found then return; end if; -- idempotent

  if v_payment.kind = 'booking_deposit' then
    update public.bookings
      set deposit_paid_at = now(),
          payment_status = 'paid'::payment_status
    where id = v_payment.booking_id;

    -- Auto-payout the provider's share (deposit minus app cut).
    perform public.enqueue_provider_payout(
      v_payment.booking_id,
      'deposit_share',
      v_payment.provider_net_halalas
    );

  elsif v_payment.kind = 'provider_commission' then
    update public.bookings
      set commission_paid_at = now(),
          commission_status = 'paid'::commission_status,
          commission_due_from_provider = 0
    where id = v_payment.booking_id;

  elsif v_payment.kind = 'final_payment' then
    update public.bookings
      set final_payment_status = 'paid'::public.final_payment_state,
          final_payment_at = now(),
          commission_paid_at = now(),
          commission_status = 'paid'::commission_status,
          commission_due_from_provider = 0
    where id = v_payment.booking_id;

    -- Auto-payout the provider's share of the final settlement.
    perform public.enqueue_provider_payout(
      v_payment.booking_id,
      'final_share',
      v_payment.provider_net_halalas
    );
  end if;

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values ('payment.paid', 'payments', p_payment_id::text, null,
    jsonb_build_object('moyasar_id', p_moyasar_id, 'kind', v_payment.kind));
end $$;

-- ============================================================
-- §5  RLS — admin reads/writes everything, provider reads own rows
-- ============================================================
-- Existing v16 policies already cover read-by-provider + admin-all.
-- Just need to grant admin update access for status changes after
-- the edge function processes a payout.
drop policy if exists "provider_payouts_admin_all" on public.provider_payouts;
create policy "provider_payouts_admin_all" on public.provider_payouts
  for all using (public.is_admin()) with check (public.is_admin());

-- Service-role bypass for the edge function to update statuses
-- without going through the admin-only policy is implicit because
-- service-role bypasses RLS entirely.

commit;
