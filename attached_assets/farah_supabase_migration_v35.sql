-- ============================================================
-- migration_v35: correct split — deposit→provider, final→platform→payout
--
-- v30 oversimplified. The real flow you want is:
--
--   1. العميل يحجز  → يدفع عربون (10% من السعر) → حساب المزود مباشرة
--      (booking_deposit, kind = 'booking_deposit')
--
--   2. المزود ينفّذ الخدمة، يضغط "اكتمال"
--      → فقط تعديل status='completed'. لا ننشئ صف عمولة بعد الآن.
--
--   3. العميل يستلم إشعار → يدفع المتبقي (90%) → حساب فرحتكم
--      (final_payment, kind = 'final_payment')
--
--   4. بعد ما ميسر يؤكد دفع المتبقي:
--      → تلقائياً نُنشئ صف في provider_payouts بمبلغ
--        (final_amount - platform_commission)
--      → الـ Edge Function يستدعي Moyasar Payouts API بمفتاح فرحتكم
--        ليحوّل المبلغ إلى IBAN المزود.
--
-- النتيجة الرياضية لخدمة 1000 ر.س، عمولة 10٪، عربون 10٪:
--   المزود يستلم: 100 (عربون فوري) + 800 (تحويل تلقائي) = 900 = 90٪
--   فرحتكم تستلم: 900 - 800 = 100 = 10٪ عمولة
--   لا دور للمزود في تحويل العمولة → مستحيل يماطل أو يحتال.
--
-- This migration:
--   §1  Restore record_completion to NOT create a commission row
--       (the commission is now part of the platform-held final amount).
--   §2  New RPC `compute_provider_payout_amount(booking_id)` returns
--       the payout owed to the provider after platform commission.
--   §3  New trigger on payments: when a final_payment flips to 'paid',
--       auto-INSERT a queued provider_payouts row. The Edge Function
--       picks it up and calls Moyasar Payouts API.
--   §4  Update default app_settings:
--         deposit_percentage = 10   (was 25 in v15)
--         commission_rate    = 10
--       Both editable from admin.
--   §5  Mark `service_payment` enum value as deprecated by aliasing
--       the RPC `create_service_payment_pending` → calls deposit RPC.
--       Existing client code keeps compiling.
-- ============================================================

begin;

-- ============================================================
-- §1  record_completion: status only, no commission row
-- ============================================================
-- v30 forced a provider_commission row at completion. In the new
-- model the commission is collected automatically when the customer
-- pays the final 90%, so the explicit commission row is dead weight.
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
  v_booking          record;
  v_provider_user_id uuid;
  v_remaining        numeric;
begin
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

  update public.bookings
    set status = 'completed'::booking_status,
        completed_at = now(),
        final_payment_method = 'online',
        final_payment_status = 'pending'
    where id = v_booking.id;

  return jsonb_build_object(
    'method',                 'online',
    'remaining',              v_remaining,
    'commission_due',         0,
    'commission_payment_id',  null,
    'final_payment_status',  'pending'
  );
end $$;

grant execute on function public.record_completion(uuid, text, text)
  to authenticated;

-- ============================================================
-- §2  compute_provider_payout_amount
-- ============================================================
-- Returns SAR owed to the provider after the platform pulls its
-- commission out of the final 90% that landed in the platform's
-- Moyasar account.
--
-- Math for a 1000 SAR service with deposit=10% commission=10%:
--   deposit_amount   = 100   (already with provider via v35 §5)
--   final_amount     = 900   (already in the platform's account)
--   total_commission = 100   (10% of full price — platform's cut)
--   payout           = final_amount - total_commission = 800
create or replace function public.compute_provider_payout_amount(
  p_booking_id uuid
)
returns numeric
language sql stable
security definer
set search_path = public
as $$
  with b as (
    select price, coalesce(deposit_amount, 0) as deposit_amount
    from public.bookings
    where id = p_booking_id
  ),
  rates as (
    select coalesce(
      (select (value::text)::numeric from public.app_settings where key = 'commission_rate'),
      10
    ) as commission_rate
  )
  select greatest(
    0,
    (b.price - b.deposit_amount)                        -- المبلغ النهائي اللي وصل لفرح
      - round(b.price * rates.commission_rate / 100.0, 2)  -- ناقص عمولة فرح من الإجمالي
  )
  from b, rates;
$$;

grant execute on function public.compute_provider_payout_amount(uuid)
  to authenticated, anon;

-- ============================================================
-- §3  trigger: auto-queue payout when final_payment is paid
-- ============================================================
-- Fires once per payment row whose status flips to 'paid' and whose
-- kind is 'final_payment'. The row inserted into provider_payouts is
-- picked up by the moyasar edge function (action: process-payouts)
-- and dispatched via Moyasar Payouts API to the provider's IBAN.
create or replace function public.auto_queue_provider_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout_sar     numeric;
  v_payout_halalas int;
begin
  if NEW.kind <> 'final_payment'::payment_kind then return NEW; end if;
  if NEW.status <> 'paid'::payment_record_status then return NEW; end if;
  if (OLD.status = 'paid'::payment_record_status) then return NEW; end if;

  -- Don't double-queue if we already created a payout for this booking.
  if exists (
    select 1 from public.provider_payouts
    where booking_id = NEW.booking_id
      and payout_type = 'final_share'::payout_type
  ) then
    return NEW;
  end if;

  v_payout_sar := public.compute_provider_payout_amount(NEW.booking_id);
  v_payout_halalas := round(v_payout_sar * 100)::int;

  if v_payout_halalas > 0 then
    insert into public.provider_payouts (
      provider_id, booking_id, amount_halalas,
      status, payout_type
    ) values (
      NEW.provider_id, NEW.booking_id, v_payout_halalas,
      'queued'::payout_status, 'final_share'::payout_type
    );
  end if;

  return NEW;
exception when others then
  raise warning 'auto_queue_provider_payout failed for payment %: %', NEW.id, sqlerrm;
  return NEW;
end $$;

drop trigger if exists trg_payments_auto_payout on public.payments;
create trigger trg_payments_auto_payout
  after update of status on public.payments
  for each row execute function public.auto_queue_provider_payout();

-- ============================================================
-- §4  defaults
-- ============================================================
insert into public.app_settings (key, value)
values
  ('deposit_percentage', '10'),
  ('commission_rate',    '10')
on conflict (key) do update set value = excluded.value;

-- ============================================================
-- §5  service_payment → alias to booking_deposit
-- ============================================================
-- v30's create_service_payment_pending was meant to charge the FULL
-- price. Now we charge a deposit only at booking time, so we rewrite
-- the RPC body to delegate to the deposit one. The client-side call
-- site keeps working (we'll port it to the deposit RPC in the next
-- code commit; the alias prevents downtime in between).
create or replace function public.create_service_payment_pending(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
begin
  v_payment_id := public.create_booking_deposit_pending(p_booking_id);
  return v_payment_id;
end $$;

grant execute on function public.create_service_payment_pending(uuid)
  to authenticated;

commit;
