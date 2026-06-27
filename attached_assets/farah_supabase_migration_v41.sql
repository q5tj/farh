-- v41: record_completion respects the provider's settlement method again
--
-- v35 made record_completion ignore p_method entirely and always force
-- final_payment_method='online', even though the "اكتمال الخدمة" modal
-- still lets the provider pick cash / bank_transfer / online. That's a
-- real bug: a provider who already collected the full price in cash had
-- no way to settle the platform's commission — the app kept demanding
-- the customer pay the remaining 90% online a second time.
--
-- This restores the v16 behaviour on top of the CURRENT (v35) schema and
-- payout pipeline:
--
--   • online         → unchanged from v35. Booking closes as
--                       final_payment_method='online',
--                       final_payment_status='pending'. The customer
--                       pays the remaining 90% to the PLATFORM via
--                       Moyasar; commission is taken out of that before
--                       the automatic payout to the provider's IBAN
--                       (compute_provider_payout_amount / v35 trigger).
--
--   • cash / bank_transfer → the customer settled the remainder with the
--                       provider directly, outside the app. The provider
--                       therefore holds the FULL price (deposit +
--                       remainder), so they owe the platform commission
--                       on the full price. The booking closes
--                       immediately (final_payment_status='paid') and we
--                       insert a `provider_commission` payment row
--                       (kind = provider_commission, status = pending).
--
--                       This reconnects existing, already-built
--                       machinery that's been orphaned since v35:
--                         - provider_commission_status view (v32/v38)
--                           picks it up as outstanding immediately.
--                         - enforce_commission_overdue() (v32, daily
--                           cron) warns at day 7/14 and SUSPENDS the
--                           provider at day 30 if unpaid — this is what
--                           "forces" the provider to pay.
--                         - createCommissionPaymentRow → Moyasar invoice
--                           on the PLATFORM's account (lib/payments.ts,
--                           already wired in the provider zone UI) is
--                           how the provider actually pays it.
--                         - notify_commission_settled (v17) and
--                           maybe_unsuspend_provider (v32) already fire
--                           once that payment clears.
--                       No new infrastructure needed — none of that was
--                       ever removed, it just stopped being fed.

create or replace function public.record_completion(
  p_booking_id uuid,
  p_method     text default 'online',
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
  v_method             text := coalesce(p_method, 'online');
  v_remaining          numeric;
  v_commission_sar     numeric;
  v_commission_halalas int;
  v_commission_id      uuid;
begin
  if v_method not in ('online', 'cash', 'bank_transfer') then
    raise exception 'invalid_method';
  end if;

  select b.id, b.provider_id, b.user_id, b.price, b.status,
         b.deposit_amount, b.payment_status
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

  if v_booking.payment_status is distinct from 'paid'::payment_status then
    raise exception 'deposit_not_paid';
  end if;

  v_remaining := v_booking.price - coalesce(v_booking.deposit_amount, 0);

  if v_method = 'online' then
    update public.bookings
      set status = 'completed'::booking_status,
          completed_at = now(),
          final_payment_method = 'online',
          final_payment_status = 'pending'
      where id = v_booking.id;

    return jsonb_build_object(
      'method',                'online',
      'remaining',             v_remaining,
      'commission_due',        0,
      'commission_payment_id', null,
      'final_payment_status',  'pending'
    );
  end if;

  -- cash / bank_transfer: provider already holds the full price, so the
  -- booking closes now and the provider owes commission on the full
  -- price (not just the deposit share).
  v_commission_sar := public.compute_full_commission(v_booking.id);
  v_commission_halalas := round(v_commission_sar * 100)::int;

  update public.bookings
    set status = 'completed'::booking_status,
        completed_at = now(),
        final_payment_method = v_method,
        final_payment_status = 'paid'
    where id = v_booking.id;

  if v_commission_halalas > 0 then
    insert into public.payments (
      booking_id, user_id, provider_id, kind,
      amount_halalas, currency, description, status
    ) values (
      v_booking.id, v_booking.user_id, v_booking.provider_id,
      'provider_commission'::payment_kind,
      v_commission_halalas,
      'SAR',
      'Platform commission (' || v_method || ') for booking ' || v_booking.id::text,
      'pending'::payment_record_status
    )
    returning id into v_commission_id;
  end if;

  return jsonb_build_object(
    'method',                v_method,
    'remaining',              0,
    'commission_due',         v_commission_sar,
    'commission_payment_id',  v_commission_id,
    'final_payment_status',   'paid'
  );
end $$;

grant execute on function public.record_completion(uuid, text, text)
  to authenticated;
