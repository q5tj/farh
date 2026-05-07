-- ============================================================
-- migration_v15.1: bridge payments → bookings.payment_status
--
-- The earlier v15 mark_payment_paid only stamped deposit_paid_at, but
-- the booking detail UI (PaymentBadge) reads bookings.payment_status
-- — so successfully paid deposits kept showing "بانتظار الدفع".
--
-- This migration drops & recreates mark_payment_paid to also flip
-- payment_status='paid' (deposit) and keep commission settlement
-- behaviour unchanged. Idempotent — safe to re-run.
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

  if not found then return; end if; -- already processed (idempotent)

  if v_payment.kind = 'booking_deposit' then
    update public.bookings
      set deposit_paid_at = now(),
          payment_status = 'paid'::payment_status
    where id = v_payment.booking_id;
  elsif v_payment.kind = 'provider_commission' then
    update public.bookings
      set commission_paid_at = now(),
          commission_status = 'paid'::commission_status,
          commission_due_from_provider = 0
    where id = v_payment.booking_id;
  end if;

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values ('payment.paid', 'payments', p_payment_id::text, null,
    jsonb_build_object('moyasar_id', p_moyasar_id, 'kind', v_payment.kind));
end $$;

-- Backfill: any booking that already has deposit_paid_at set should
-- already have payment_status='paid' as well. v15 forgot to flip it,
-- so older payments are stuck on the "بانتظار الدفع" badge.
update public.bookings
  set payment_status = 'paid'::payment_status
where deposit_paid_at is not null
  and payment_status <> 'paid'::payment_status;
