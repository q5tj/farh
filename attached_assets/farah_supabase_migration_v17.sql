-- ============================================================
-- migration_v17: i18n notifications + completion/final-payment events
--
-- Fixes / adds:
--   §1  All bookings-status notifications now respect users.language
--        (Arabic + English).
--   §2  When a provider completes a booking, the customer notification
--        is tailored to the chosen settlement method:
--           online        → "Service done — pay the remainder to close"
--           cash / bank   → "Service done — thank you for using Farhatukum"
--   §3  When the customer pays the remainder (final_payment.paid), the
--        provider gets a notification "Customer settled the remainder".
--   §4  When the provider settles a pending commission, they get a
--        confirmation notification.
--   §5  RPC `send_final_payment_reminders()` — for a daily cron job.
--        Picks every booking with final_payment_method='online' and
--        final_payment_status='pending' and inserts a fresh reminder.
--   §6  Update record_completion to insert the right post-completion
--        notification(s).
-- ============================================================

begin;

-- ============================================================
-- §1  Helper: localized status title for a user
-- ============================================================
create or replace function public.tx_status_title(
  p_status text,
  p_lang text
) returns text
language sql stable as $$
  select case when coalesce(p_lang, 'ar') = 'en' then
    case p_status
      when 'pending'   then 'Booking pending'
      when 'accepted'  then 'Booking in progress'
      when 'rejected'  then 'Booking rejected'
      when 'completed' then 'Service completed'
      when 'cancelled' then 'Booking cancelled'
      else 'Booking update'
    end
  else
    case p_status
      when 'pending'   then 'بانتظار الرد'
      when 'accepted'  then 'تم قبول حجزك — قيد التنفيذ'
      when 'rejected'  then 'تم رفض حجزك'
      when 'completed' then 'تم إنهاء الخدمة'
      when 'cancelled' then 'تم إلغاء الحجز'
      else 'تحديث على حجزك'
    end
  end;
$$;

create or replace function public.tx_user_lang(p_user_id uuid)
returns text language sql stable as $$
  select coalesce(language::text, 'ar') from public.users where id = p_user_id;
$$;

-- ============================================================
-- §2  Replace notify_booking_event to:
--      • use users.language for tone/locale
--      • when status flips to completed, branch on final_payment_method
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

  -- (a) New booking
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

    if provider_user_id is not null then
      if provider_lang = 'en' then
        notif_title := 'New booking request';
        notif_body  := 'You have a new booking request for "' || new.service_title || '"';
      else
        notif_title := 'طلب حجز جديد';
        notif_body  := 'لديك طلب حجز جديد للخدمة "' || new.service_title || '"';
      end if;
      insert into public.notifications (user_id, title, body, booking_id)
      values (provider_user_id, notif_title, notif_body, new.id);
    end if;
    return new;
  end if;

  -- (b) Status change
  if (TG_OP = 'UPDATE') and (old.status is distinct from new.status) then
    -- Customer: localized status notification
    if new.status = 'completed' then
      -- branch on settlement method
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

    -- If customer cancelled, also tell the provider
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

  -- (c) Final payment status changed (online flow)
  if (TG_OP = 'UPDATE')
     and old.final_payment_status is distinct from new.final_payment_status
     and new.final_payment_status = 'paid'
     and new.final_payment_method = 'online' then

    -- Notify the provider
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

    -- Notify the customer (thank-you)
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

  return new;

exception when others then
  raise warning 'notify_booking_event failed for booking %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_bookings_notify on public.bookings;
create trigger trg_bookings_notify
  after insert or update of status, final_payment_status on public.bookings
  for each row execute function public.notify_booking_event();

-- ============================================================
-- §3  Notify provider when their commission is settled
--      (provider_commission row → status = 'paid')
-- ============================================================
create or replace function public.notify_commission_settled()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  provider_user_id uuid;
  provider_lang    text;
  amt_sar          numeric;
begin
  if new.kind <> 'provider_commission' then return new; end if;
  if old.status = 'paid' or new.status <> 'paid' then return new; end if;

  select p.user_id into provider_user_id
    from public.providers p where p.id = new.provider_id;
  if provider_user_id is null then return new; end if;

  provider_lang := public.tx_user_lang(provider_user_id);
  amt_sar := round(new.amount_halalas / 100.0, 2);

  if provider_lang = 'en' then
    insert into public.notifications (user_id, title, body, booking_id)
    values (
      provider_user_id,
      'Commission settled',
      'You settled ' || amt_sar::text || ' SAR in platform commission. Thank you!',
      new.booking_id
    );
  else
    insert into public.notifications (user_id, title, body, booking_id)
    values (
      provider_user_id,
      'تم سداد العمولة',
      'تم سداد ' || amt_sar::text || ' ر.س عمولة منصة. شكراً!',
      new.booking_id
    );
  end if;

  return new;
exception when others then
  raise warning 'notify_commission_settled failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_payments_commission_notify on public.payments;
create trigger trg_payments_commission_notify
  after update of status on public.payments
  for each row execute function public.notify_commission_settled();

-- ============================================================
-- §4  RPC: send_final_payment_reminders (call from cron daily)
--      Inserts at most one reminder per booking per 24h.
-- ============================================================
create or replace function public.send_final_payment_reminders()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_booking record;
  v_lang    text;
  v_count   integer := 0;
  v_recent  integer;
begin
  for v_booking in
    select b.id, b.user_id, b.service_title
      from public.bookings b
      where b.status = 'completed'
        and b.final_payment_method = 'online'
        and b.final_payment_status = 'pending'
  loop
    -- Skip if a reminder was already sent in the last 22 hours.
    select count(*) into v_recent
      from public.notifications n
      where n.booking_id = v_booking.id
        and n.title in (
          'تذكير: استكمال دفع المتبقي',
          'Reminder: complete the remaining payment'
        )
        and n.created_at > now() - interval '22 hours';
    if v_recent > 0 then continue; end if;

    v_lang := public.tx_user_lang(v_booking.user_id);
    if v_lang = 'en' then
      insert into public.notifications (user_id, title, body, booking_id)
      values (
        v_booking.user_id,
        'Reminder: complete the remaining payment',
        'You still owe the remainder for "' || v_booking.service_title || '". Open the booking to pay and close it.',
        v_booking.id
      );
    else
      insert into public.notifications (user_id, title, body, booking_id)
      values (
        v_booking.user_id,
        'تذكير: استكمال دفع المتبقي',
        'لا يزال عليك المتبقي لخدمة "' || v_booking.service_title || '". افتح الحجز وادفع لإتمام العملية.',
        v_booking.id
      );
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

grant execute on function public.send_final_payment_reminders() to service_role;

-- ============================================================
-- §5  pg_cron job — daily at 10:00 UTC (≈ 13:00 Riyadh)
--      Schedules `send_final_payment_reminders()`.
-- ============================================================
do $$ begin
  -- pg_cron may or may not be enabled. Be defensive.
  perform 1 from pg_extension where extname = 'pg_cron';
  if found then
    -- unschedule any prior version of this job (idempotent)
    perform cron.unschedule(jobname)
      from cron.job
      where jobname = 'farah_final_payment_reminders';
    perform cron.schedule(
      'farah_final_payment_reminders',
      '0 10 * * *',
      $cron$ select public.send_final_payment_reminders(); $cron$
    );
  else
    raise notice 'pg_cron not enabled — skipping daily reminder job. Enable it in Supabase Dashboard → Database → Extensions, then re-run this migration.';
  end if;
end $$;

commit;
