-- v42: stop routing customer money through the platform
--
-- Correction to the model v35/v41 were built on. The actual intended
-- design is much simpler than v35 made it:
--
--   • ALL customer money (deposit AND the remaining amount, however the
--     customer settles it — cash, bank transfer, OR online) goes
--     directly to the PROVIDER. The platform never holds booking funds
--     and never pays the provider anything.
--   • The provider owes the platform a commission on the FULL price
--     once the service is settled. They pay it themselves, separately,
--     via their "كشف حسابي" (statement) screen — a Moyasar invoice
--     charged against the PLATFORM's own account. That is the ONLY
--     time the platform's Moyasar key is ever used.
--
-- This requires two backend changes (the Moyasar key routing is fixed
-- in the edge function, in the same commit):
--
--   §1  Drop the v35 trigger that auto-paid the provider out of
--       "platform-held" final-payment funds. Now that final_payment is
--       charged to the PROVIDER's own Moyasar key (see pickSecretKey in
--       supabase/functions/moyasar/index.ts), the platform never
--       receives that money, so there is nothing to pay out — leaving
--       this trigger in place would have tried to send the provider a
--       SECOND, bogus payment for money they already collected
--       directly.
--
--   §2  Rewrite mark_payment_paid so kind='final_payment' no longer
--       auto-marks the commission as settled (it never was — that was
--       only true under the old "platform deducts its cut before
--       paying out" model) and no longer enqueues a payout. Instead, it
--       bills the provider commission on the full price as a new
--       `provider_commission` row — exactly like record_completion
--       already does for cash/bank_transfer (v41) — and notifies the
--       provider. This reuses the existing overdue-commission ladder
--       (v32) and the "pay commission" flow shipped alongside this
--       migration, so cash/bank_transfer/online all end up billing the
--       provider commission the same way.
--
-- compute_provider_payout_amount and auto_queue_provider_payout become
-- dead code under this model — dropped. enqueue_provider_payout and the
-- provider_payouts table/admin screen are left in place (harmless,
-- still useful for any historical rows or a manual admin entry), they
-- just stop being fed automatically.

begin;

-- ============================================================
-- §1  Remove the wrong auto-payout trigger from v35
-- ============================================================
drop trigger if exists trg_payments_auto_payout on public.payments;
drop function if exists public.auto_queue_provider_payout();
drop function if exists public.compute_provider_payout_amount(uuid);

-- ============================================================
-- §2  mark_payment_paid: bill commission instead of auto-settling it
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
  v_payment            record;
  v_commission_sar     numeric;
  v_commission_halalas int;
  v_commission_id      uuid;
  v_provider_user_id   uuid;
  v_lang               text;
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

  elsif v_payment.kind = 'provider_commission' then
    update public.bookings
      set commission_paid_at = now(),
          commission_status = 'paid'::commission_status,
          commission_due_from_provider = 0
    where id = v_payment.booking_id;

  elsif v_payment.kind = 'final_payment' then
    -- The customer paid the remainder straight into the provider's own
    -- Moyasar account — the platform never touched this money. The
    -- provider now owes commission on the FULL price, billed here as a
    -- separate provider_commission row (same as the cash/bank_transfer
    -- path in record_completion).
    update public.bookings
      set final_payment_status = 'paid'::public.final_payment_state,
          final_payment_at = now()
      where id = v_payment.booking_id;

    v_commission_sar := public.compute_full_commission(v_payment.booking_id);
    v_commission_halalas := round(v_commission_sar * 100)::int;

    if v_commission_halalas > 0 then
      insert into public.payments (
        booking_id, user_id, provider_id, kind,
        amount_halalas, currency, description, status
      ) values (
        v_payment.booking_id, v_payment.user_id, v_payment.provider_id,
        'provider_commission'::payment_kind,
        v_commission_halalas,
        'SAR',
        'Platform commission (online) for booking ' || v_payment.booking_id::text,
        'pending'::payment_record_status
      )
      returning id into v_commission_id;

      select p.user_id into v_provider_user_id
        from public.providers p where p.id = v_payment.provider_id;

      if v_provider_user_id is not null then
        v_lang := public.tx_user_lang(v_provider_user_id);
        if v_lang = 'en' then
          insert into public.notifications (user_id, title, body, booking_id)
          values (
            v_provider_user_id,
            'Customer paid — commission due',
            'The customer paid the remaining amount directly to you. You owe ' ||
              v_commission_sar::text || ' SAR platform commission — settle it from your statement.',
            v_payment.booking_id
          );
        else
          insert into public.notifications (user_id, title, body, booking_id)
          values (
            v_provider_user_id,
            'العميل سدّد — عليك عمولة',
            'سدّد العميل المبلغ المتبقي مباشرة لك. عليك ' ||
              v_commission_sar::text || ' ر.س عمولة منصة — سددها من كشف حسابك.',
            v_payment.booking_id
          );
        end if;
      end if;
    end if;
  end if;

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values ('payment.paid', 'payments', p_payment_id::text, null,
    jsonb_build_object('moyasar_id', p_moyasar_id, 'kind', v_payment.kind));
end $$;

commit;
