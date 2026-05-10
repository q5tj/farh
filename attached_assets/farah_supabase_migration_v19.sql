-- ============================================================
-- migration_v19: bilingual notifications (title_ar/en + body_ar/en)
--
-- Until now, notifications.title / notifications.body were single-string
-- snapshots of whatever language the *recipient's* preference was at
-- INSERT time. If they later switched language, old rows stayed in the
-- previous language. This migration:
--
--   §1  Adds title_ar, title_en, body_ar, body_en columns.
--   §2  Backfills the new columns from existing rows: writes the
--        current single-string copy into the column matching each
--        user's language preference at the moment of migration, and
--        copies the same string into the other column as a fallback
--        (better than NULL so the old rows are still readable).
--   §3  Replaces notify_booking_event + notify_commission_settled to
--        write BOTH languages on every new row, so the client can pick
--        the right one at render time regardless of when the user
--        flipped languages.
--   §4  send_final_payment_reminders is updated the same way.
-- ============================================================

begin;

-- ============================================================
-- §1  Schema
-- ============================================================
alter table public.notifications
  add column if not exists title_ar text,
  add column if not exists title_en text,
  add column if not exists body_ar text,
  add column if not exists body_en text;

-- ============================================================
-- §2  Backfill — copy the existing one-language snapshot into the
--      column matching the recipient's current preferred language.
--      The other language column gets the same string as a fallback so
--      old rows render in either UI language (better UX than blanks).
-- ============================================================
do $$
declare
  rec record;
  user_lang text;
begin
  for rec in
    select id, user_id, title, body
      from public.notifications
      where (title_ar is null and title_en is null)
  loop
    select coalesce(language::text, 'ar') into user_lang
      from public.users where id = rec.user_id;
    if user_lang = 'en' then
      update public.notifications
        set title_en = rec.title,
            body_en = rec.body,
            title_ar = rec.title,
            body_ar = rec.body
        where id = rec.id;
    else
      update public.notifications
        set title_ar = rec.title,
            body_ar = rec.body,
            title_en = rec.title,
            body_en = rec.body
        where id = rec.id;
    end if;
  end loop;
end $$;

-- ============================================================
-- §3  Replace notify_booking_event with a bilingual writer.
--      Same signature & event coverage as v17 — just writes both
--      languages on every insert and keeps the legacy `title`/`body`
--      columns in sync with the recipient's current preference (so
--      the API & DB still show *something* if a client reads the
--      legacy columns).
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
  -- AR / EN copy for the customer + provider events
  c_title_ar text;  c_title_en text;  c_body_ar text;  c_body_en text;
  p_title_ar text;  p_title_en text;
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
    c_title_ar := 'تم إرسال الحجز';
    c_title_en := 'Booking submitted';
    c_body_ar  := 'استلمنا طلبك "' || new.service_title || '". سنخطرك فور رد المزود.';
    c_body_en  := 'We received your request "' || new.service_title || '". You will be notified when the provider replies.';
    insert into public.notifications
      (user_id, title, body, title_ar, title_en, body_ar, body_en, booking_id)
    values
      (new.user_id,
       case when customer_lang='en' then c_title_en else c_title_ar end,
       case when customer_lang='en' then c_body_en  else c_body_ar  end,
       c_title_ar, c_title_en, c_body_ar, c_body_en, new.id);

    if provider_user_id is not null then
      p_title_ar := 'طلب حجز جديد';
      p_title_en := 'New booking request';
      insert into public.notifications
        (user_id, title, body, title_ar, title_en, body_ar, body_en, booking_id)
      values
        (provider_user_id,
         case when provider_lang='en' then p_title_en else p_title_ar end,
         case when provider_lang='en'
              then 'You have a new booking request for "' || new.service_title || '"'
              else 'لديك طلب حجز جديد للخدمة "' || new.service_title || '"' end,
         p_title_ar, p_title_en,
         'لديك طلب حجز جديد للخدمة "' || new.service_title || '"',
         'You have a new booking request for "' || new.service_title || '"',
         new.id);
    end if;
    return new;
  end if;

  -- (b) Status change
  if (TG_OP = 'UPDATE') and (old.status is distinct from new.status) then
    if new.status = 'completed' then
      if new.final_payment_method = 'online'
         and new.final_payment_status = 'pending' then
        c_title_ar := 'تم إنهاء الخدمة — يلزم استكمال السداد';
        c_title_en := 'Service completed — pay the remainder';
        c_body_ar  := 'أنهى المزود الخدمة. افتح الحجز وادفع المبلغ المتبقي لإتمام العملية.';
        c_body_en  := 'The provider has completed the service. Open the booking to pay the remaining amount and close it.';
      else
        c_title_ar := 'تم إنهاء الخدمة';
        c_title_en := 'Service completed';
        c_body_ar  := 'شكراً لاستخدامك تطبيق فرحتكم. نتمنى أن تكون تجربتك مع "' || new.service_title || '" ممتعة.';
        c_body_en  := 'Thank you for using Farhatukum. We hope you had a great experience with "' || new.service_title || '".';
      end if;
    else
      c_title_ar := public.tx_status_title(new.status::text, 'ar');
      c_title_en := public.tx_status_title(new.status::text, 'en');
      c_body_ar  := new.service_title;
      c_body_en  := new.service_title;
    end if;
    insert into public.notifications
      (user_id, title, body, title_ar, title_en, body_ar, body_en, booking_id)
    values
      (new.user_id,
       case when customer_lang='en' then c_title_en else c_title_ar end,
       case when customer_lang='en' then c_body_en  else c_body_ar  end,
       c_title_ar, c_title_en, c_body_ar, c_body_en, new.id);

    if new.status = 'cancelled' and provider_user_id is not null then
      p_title_ar := 'ألغى العميل الحجز';
      p_title_en := 'Booking cancelled by customer';
      insert into public.notifications
        (user_id, title, body, title_ar, title_en, body_ar, body_en, booking_id)
      values
        (provider_user_id,
         case when provider_lang='en' then p_title_en else p_title_ar end,
         new.service_title,
         p_title_ar, p_title_en, new.service_title, new.service_title, new.id);
    end if;
    return new;
  end if;

  -- (c) Final-payment status changed (online flow)
  if (TG_OP = 'UPDATE')
     and old.final_payment_status is distinct from new.final_payment_status
     and new.final_payment_status = 'paid'
     and new.final_payment_method = 'online' then

    if provider_user_id is not null then
      p_title_ar := 'العميل سدّد المتبقي';
      p_title_en := 'Customer paid the remainder';
      insert into public.notifications
        (user_id, title, body, title_ar, title_en, body_ar, body_en, booking_id)
      values
        (provider_user_id,
         case when provider_lang='en' then p_title_en else p_title_ar end,
         case when provider_lang='en'
              then 'The customer settled the remaining amount for "' || new.service_title || '". The booking is fully closed.'
              else 'دفع العميل المبلغ المتبقي لخدمة "' || new.service_title || '". الحجز مغلق بالكامل.' end,
         p_title_ar, p_title_en,
         'دفع العميل المبلغ المتبقي لخدمة "' || new.service_title || '". الحجز مغلق بالكامل.',
         'The customer settled the remaining amount for "' || new.service_title || '". The booking is fully closed.',
         new.id);
    end if;

    c_title_ar := 'تم استكمال السداد';
    c_title_en := 'Payment completed';
    c_body_ar  := 'شكراً لاستخدامك تطبيق فرحتكم — نتمنى لك مناسبة سعيدة!';
    c_body_en  := 'Thank you for using Farhatukum — wishing you a wonderful event!';
    insert into public.notifications
      (user_id, title, body, title_ar, title_en, body_ar, body_en, booking_id)
    values
      (new.user_id,
       case when customer_lang='en' then c_title_en else c_title_ar end,
       case when customer_lang='en' then c_body_en  else c_body_ar  end,
       c_title_ar, c_title_en, c_body_ar, c_body_en, new.id);

    return new;
  end if;

  return new;

exception when others then
  raise warning 'notify_booking_event failed for booking %: %', new.id, sqlerrm;
  return new;
end $$;

-- ============================================================
-- §4  Replace notify_commission_settled with a bilingual writer.
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
  t_ar text; t_en text; b_ar text; b_en text;
begin
  if new.kind <> 'provider_commission' then return new; end if;
  if old.status = 'paid' or new.status <> 'paid' then return new; end if;

  select p.user_id into provider_user_id
    from public.providers p where p.id = new.provider_id;
  if provider_user_id is null then return new; end if;

  provider_lang := public.tx_user_lang(provider_user_id);
  amt_sar := round(new.amount_halalas / 100.0, 2);

  t_ar := 'تم سداد العمولة';
  t_en := 'Commission settled';
  b_ar := 'تم سداد ' || amt_sar::text || ' ر.س عمولة منصة. شكراً!';
  b_en := 'You settled ' || amt_sar::text || ' SAR in platform commission. Thank you!';

  insert into public.notifications
    (user_id, title, body, title_ar, title_en, body_ar, body_en, booking_id)
  values
    (provider_user_id,
     case when provider_lang='en' then t_en else t_ar end,
     case when provider_lang='en' then b_en else b_ar end,
     t_ar, t_en, b_ar, b_en, new.booking_id);

  return new;
exception when others then
  raise warning 'notify_commission_settled failed: %', sqlerrm;
  return new;
end $$;

-- ============================================================
-- §5  Replace send_final_payment_reminders to write both languages.
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
  t_ar text; t_en text; b_ar text; b_en text;
begin
  for v_booking in
    select b.id, b.user_id, b.service_title
      from public.bookings b
      where b.status = 'completed'
        and b.final_payment_method = 'online'
        and b.final_payment_status = 'pending'
  loop
    select count(*) into v_recent
      from public.notifications n
      where n.booking_id = v_booking.id
        and (n.title_ar = 'تذكير: استكمال دفع المتبقي'
             or n.title_en = 'Reminder: complete the remaining payment'
             or n.title in ('تذكير: استكمال دفع المتبقي',
                             'Reminder: complete the remaining payment'))
        and n.created_at > now() - interval '22 hours';
    if v_recent > 0 then continue; end if;

    v_lang := public.tx_user_lang(v_booking.user_id);
    t_ar := 'تذكير: استكمال دفع المتبقي';
    t_en := 'Reminder: complete the remaining payment';
    b_ar := 'لا يزال عليك المتبقي لخدمة "' || v_booking.service_title || '". افتح الحجز وادفع لإتمام العملية.';
    b_en := 'You still owe the remainder for "' || v_booking.service_title || '". Open the booking to pay and close it.';

    insert into public.notifications
      (user_id, title, body, title_ar, title_en, body_ar, body_en, booking_id)
    values
      (v_booking.user_id,
       case when v_lang='en' then t_en else t_ar end,
       case when v_lang='en' then b_en else b_ar end,
       t_ar, t_en, b_ar, b_en, v_booking.id);

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

commit;
