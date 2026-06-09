-- ============================================================
-- migration_v25: gate provider visibility on deposit payment
--
-- Before this migration, a booking row was inserted as soon as the
-- customer hit "Confirm" — even if they then bounced out of the Moyasar
-- hosted invoice without paying. The `trg_bookings_notify` trigger
-- pushed a "New booking request" notification to the provider on every
-- INSERT, and the provider zone's requests list pulled every row
-- regardless of payment_status. Result: providers were chasing leads
-- that hadn't paid the deposit (and many never would).
--
-- This migration makes two changes:
--
--   §1  notify_booking_event() no longer notifies the provider on the
--       INSERT branch. Customer still gets their "Booking submitted"
--       confirmation immediately. A new branch on UPDATE fires the
--       provider notification when payment_status flips from pending
--       to paid (the actual moment the booking becomes real revenue).
--
--   §2  RLS policy on bookings hides pending-payment rows from the
--       provider until the deposit is settled. The customer still sees
--       their own row in /(tabs)/bookings so they can retry payment.
--       Admins are exempted so they can still see all rows for support.
--
-- Note on the slot reservation: this migration does NOT change the busy-
-- interval logic. A pending-payment booking still holds the slot in
-- provider_busy_intervals so two customers can't race onto the same
-- time. A future migration can add a periodic cleanup of bookings whose
-- payment_status has been pending for > N minutes.
-- ============================================================

begin;

-- ============================================================
-- §1  notify_booking_event: drop provider notification on INSERT,
--      add provider notification on payment_status pending → paid
-- ============================================================
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

  -- (a) New booking — customer-only confirmation. The provider learns
  --     about the booking only after the deposit is paid (branch d).
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

  -- (b) Status change
  if (TG_OP = 'UPDATE') and (old.status is distinct from new.status) then
    if new.status = 'completed' then
      if new.final_payment_method = 'online'
         and new.final_payment_status = 'pending' then
        if customer_lang = 'en' then
          notif_title := 'Service completed — pay the remainder';
          notif_body  := 'The provider has completed the service. Open the booking to pay the remaining amount and close it.';
        else
          notif_title := 'تم إنهاء الخدمة — يلزم استكمال السداد';
          notif_body  := 'أنهى المزود الخدمة. افتح الحجز وادفع المبلغ المتبقي لإتمام العملية.';
        end if;
      else
        if customer_lang = 'en' then
          notif_title := 'Service completed';
          notif_body  := 'Thank you for using Farhatukum. We hope you had a great experience with "' || new.service_title || '".';
        else
          notif_title := 'تم إنهاء الخدمة';
          notif_body  := 'شكراً لاستخدامك تطبيق فرحتكم. نتمنى أن تكون تجربتك مع "' || new.service_title || '" ممتعة.';
        end if;
      end if;
    else
      notif_title := public.tx_status_title(new.status::text, customer_lang);
      notif_body  := new.service_title;
    end if;
    insert into public.notifications (user_id, title, body, booking_id)
    values (new.user_id, notif_title, notif_body, new.id);

    if new.status = 'cancelled' and provider_user_id is not null then
      if provider_lang = 'en' then
        notif_title := 'Booking cancelled by customer';
      else
        notif_title := 'ألغى العميل الحجز';
      end if;
      insert into public.notifications (user_id, title, body, booking_id)
      values (provider_user_id, notif_title, new.service_title, new.id);
    end if;
    return new;
  end if;

  -- (c) Final payment status changed (online flow) — unchanged
  if (TG_OP = 'UPDATE')
     and old.final_payment_status is distinct from new.final_payment_status
     and new.final_payment_status = 'paid'
     and new.final_payment_method = 'online' then

    if provider_user_id is not null then
      if provider_lang = 'en' then
        notif_title := 'Customer paid the remainder';
        notif_body  := 'The customer settled the remaining amount for "' || new.service_title || '". The booking is fully closed.';
      else
        notif_title := 'العميل سدّد المتبقي';
        notif_body  := 'دفع العميل المبلغ المتبقي لخدمة "' || new.service_title || '". الحجز مغلق بالكامل.';
      end if;
      insert into public.notifications (user_id, title, body, booking_id)
      values (provider_user_id, notif_title, notif_body, new.id);
    end if;

    if customer_lang = 'en' then
      notif_title := 'Payment completed';
      notif_body  := 'Thank you for using Farhatukum — wishing you a wonderful event!';
    else
      notif_title := 'تم استكمال السداد';
      notif_body  := 'شكراً لاستخدامك تطبيق فرحتكم — نتمنى لك مناسبة سعيدة!';
    end if;
    insert into public.notifications (user_id, title, body, booking_id)
    values (new.user_id, notif_title, notif_body, new.id);

    return new;
  end if;

  -- (d) Deposit was paid — provider learns about the booking *now*.
  --     Triggered when payment_status transitions to 'paid'. This is
  --     the new behaviour replacing the INSERT-time provider notify.
  if (TG_OP = 'UPDATE')
     and old.payment_status is distinct from new.payment_status
     and new.payment_status = 'paid'
     and provider_user_id is not null then
    if provider_lang = 'en' then
      notif_title := 'New booking request';
      notif_body  := 'You have a new booking request for "' || new.service_title || '" — deposit paid.';
    else
      notif_title := 'طلب حجز جديد';
      notif_body  := 'لديك طلب حجز جديد للخدمة "' || new.service_title || '" — العربون مدفوع.';
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

-- The trigger itself must now fire on payment_status changes too so the
-- branch (d) above can run.
drop trigger if exists trg_bookings_notify on public.bookings;
create trigger trg_bookings_notify
  after insert or update of status, final_payment_status, payment_status on public.bookings
  for each row execute function public.notify_booking_event();

-- ============================================================
-- §2  RLS: providers can't see bookings until the deposit is paid.
--      Customer sees their own row regardless (so they can retry).
--      Admin sees everything via is_admin().
--
-- The original policy from the schema joined customer + provider +
-- admin in one OR. We rewrite it so the provider arm requires
-- payment_status='paid'.
-- ============================================================
drop policy if exists "bookings_select_visible" on public.bookings;
create policy "bookings_select_visible" on public.bookings
  for select using (
    -- Customer: always see their own row (so they can retry payment).
    user_id in (select id from public.users where auth_user_id = auth.uid())

    -- Provider: see ONLY rows where the deposit was paid.
    or (
      provider_id in (
        select p.id from public.providers p
        join public.users u on u.id = p.user_id
        where u.auth_user_id = auth.uid()
      )
      and payment_status = 'paid'::payment_status
    )

    -- Admin: see everything for support / oversight.
    or public.is_admin()
  );

commit;
