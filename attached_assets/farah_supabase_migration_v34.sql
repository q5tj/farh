-- ============================================================
-- migration_v34: cleanup — drop legacy deposit / cancel / payout artifacts
--
-- v30 — v33 introduced the new payment model but kept the old columns
-- so historical rows still render correctly during the cutover. This
-- migration removes the deadweight once you're sure no production
-- bookings on the old flow remain.
--
-- ⚠️ SAFETY: review the SELECTs at §0 first. If ANY of them return
--    rows you don't want to lose, abort and migrate the data first.
--    On a fresh dev project this is a no-op.
--
-- What this migration drops:
--   §1  bookings columns:
--         deposit_amount, deposit_paid_at,
--         commission_due_from_provider, refund_status, refund_amount,
--         final_payment_method, final_payment_status, final_payment_at,
--         cancelled_at, cancelled_by, cancellation_reason
--   §2  Legacy RPCs:
--         compute_deposit_amount, compute_refund_amount,
--         create_booking_deposit_pending, create_final_payment_pending,
--         create_commission_payment_pending,
--         mark_payment_refunded
--   §3  Legacy tables:
--         provider_payouts (platform-driven payouts gone in v30)
--   §4  app_settings rows that no longer apply:
--         deposit_percentage, app_share_from_deposit,
--         cancellation_window_full_days, cancellation_window_half_days
--   §5  Notification triggers / functions tied to the old deposit flow.
--   §6  Payment-kind enum is NOT shrunk — Postgres can't drop enum
--       values cleanly. We keep 'booking_deposit', 'final_payment'
--       in the enum forever; the app code just stops emitting them.
-- ============================================================

begin;

-- ============================================================
-- §0  SANITY CHECK — run manually before committing
-- ============================================================
-- Uncomment to inspect before wiping. If any of these are nonzero on a
-- live system, STOP and migrate the data first.
--
-- select 'bookings with deposit' as label, count(*) from public.bookings where deposit_paid_at is not null;
-- select 'bookings cancelled'    as label, count(*) from public.bookings where cancelled_at is not null;
-- select 'pending payouts'       as label, count(*) from public.provider_payouts where status in ('queued','initiated');
-- select 'deposit payments'      as label, count(*) from public.payments where kind in ('booking_deposit', 'final_payment');

-- ============================================================
-- §1  bookings — drop legacy columns
-- ============================================================
alter table public.bookings
  drop column if exists deposit_amount,
  drop column if exists deposit_paid_at,
  drop column if exists commission_due_from_provider,
  drop column if exists refund_status,
  drop column if exists refund_amount,
  drop column if exists final_payment_method,
  drop column if exists final_payment_status,
  drop column if exists final_payment_at,
  drop column if exists cancelled_at,
  drop column if exists cancelled_by,
  drop column if exists cancellation_reason;

-- ============================================================
-- §2  legacy RPCs — drop
-- ============================================================
drop function if exists public.compute_deposit_amount(numeric);
drop function if exists public.compute_refund_amount(uuid);
drop function if exists public.create_booking_deposit_pending(uuid);
drop function if exists public.create_final_payment_pending(uuid);
drop function if exists public.create_commission_payment_pending(uuid);
drop function if exists public.mark_payment_refunded(uuid, integer, text);

-- ============================================================
-- §3  legacy tables — drop
-- ============================================================
-- Provider payouts only made sense when the platform held the money.
-- In the new model the customer pays the provider directly, so the
-- payout machinery is dead weight.
drop table if exists public.provider_payouts cascade;

-- ============================================================
-- §4  obsolete app_settings rows
-- ============================================================
delete from public.app_settings
where key in (
  'deposit_percentage',
  'app_share_from_deposit',
  'cancellation_window_full_days',
  'cancellation_window_half_days'
);

-- ============================================================
-- §5  rewire notify_booking_event to drop final-payment branch
-- ============================================================
-- The trigger in v25 still mentioned final_payment_status. Now that
-- the column is gone, we have to recreate the function without that
-- branch and drop the column from the trigger's `update of` clause.
create or replace function public.notify_booking_event()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  provider_user_id uuid;
  customer_lang    text;
  provider_lang    text;
  notif_title      text;
  notif_body       text;
begin
  select p.user_id into provider_user_id
    from public.providers p
    where p.id = new.provider_id;

  customer_lang := public.tx_user_lang(new.user_id);
  provider_lang := case when provider_user_id is not null
                        then public.tx_user_lang(provider_user_id)
                        else 'ar' end;

  -- (a) New booking — customer-only confirmation. Provider learns
  --     about the booking only after payment_status flips to 'paid'.
  if (TG_OP = 'INSERT') then
    if customer_lang = 'en' then
      notif_title := 'Booking submitted';
      notif_body  := 'We received your request "' || new.service_title || '". You will be notified when the provider replies.';
    else
      notif_title := 'تم إرسال الحجز';
      notif_body  := 'استلمنا طلبك "' || new.service_title || '". سنخطرك فور رد المزود.';
    end if;
    insert into public.notifications (user_id, title, body, booking_id)
    values (new.user_id, notif_title, notif_body, new.id);
    return new;
  end if;

  -- (b) Status change → notify the customer
  if (TG_OP = 'UPDATE') and (old.status is distinct from new.status) then
    if new.status = 'completed' then
      if customer_lang = 'en' then
        notif_title := 'Service completed';
        notif_body  := 'Thank you for using Farhatukum. We hope you had a great experience with "' || new.service_title || '".';
      else
        notif_title := 'تم إنهاء الخدمة';
        notif_body  := 'شكراً لاستخدامك تطبيق فرحتكم. نتمنى أن تكون تجربتك مع "' || new.service_title || '" ممتعة.';
      end if;
    else
      notif_title := public.tx_status_title(new.status::text, customer_lang);
      notif_body  := new.service_title;
    end if;
    insert into public.notifications (user_id, title, body, booking_id)
    values (new.user_id, notif_title, notif_body, new.id);
    return new;
  end if;

  -- (c) Payment paid → notify the provider with a real booking
  if (TG_OP = 'UPDATE')
     and old.payment_status is distinct from new.payment_status
     and new.payment_status = 'paid'
     and provider_user_id is not null then
    if provider_lang = 'en' then
      notif_title := 'New booking request';
      notif_body  := 'You have a new booking request for "' || new.service_title || '" — paid in full.';
    else
      notif_title := 'طلب حجز جديد';
      notif_body  := 'لديك طلب حجز جديد للخدمة "' || new.service_title || '" — مدفوع بالكامل.';
    end if;
    insert into public.notifications (user_id, title, body, booking_id)
    values (provider_user_id, notif_title, notif_body, new.id);
    return new;
  end if;

  return new;
exception when others then
  raise warning 'notify_booking_event failed for booking %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_bookings_notify on public.bookings;
create trigger trg_bookings_notify
  after insert or update of status, payment_status on public.bookings
  for each row execute function public.notify_booking_event();

-- ============================================================
-- §6  payment_kind enum
-- ============================================================
-- Postgres doesn't let us drop enum values without recreating the type
-- and rewriting every column that references it. The cost isn't worth
-- it just to hide unused values from \dT. The app code no longer
-- inserts 'booking_deposit' / 'final_payment', so they're inert.

commit;
