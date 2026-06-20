-- ============================================================
-- فرح | Farah — Supabase Migration v3 (المرحلة 4)
-- نفّذ هذا الملف بعد migration_v2 في Supabase SQL Editor
-- ============================================================
-- يضيف:
--   • triggers جانب-السيرفر لتوليد إشعارات الحجز
--      (لا نعتمد على الكلاينت لإنشاء الإشعارات)
--   • سياسة RLS صارمة للإشعارات: المستخدم يقرأ/يحدّث إشعاراته فقط،
--     ولا أحد يستطيع INSERT من الكلاينت — التريجرات فقط (SECURITY DEFINER)
--   • حماية من تصعيد الدور: المستخدم لا يستطيع رفع نفسه إلى admin
--   • تفعيل RLS وسياسات على provider_images (لم تُغطّ في v1)
--   • إشعار ترحيب عند إنشاء مستخدم جديد
-- ============================================================


-- ============================================================
-- 1) NOTIFICATIONS — RLS مُحكمة
-- ============================================================
-- لا نسمح بـ INSERT من المستخدمين العاديين أبداً.
-- إشعارات الحجز تُولَّد من triggers (SECURITY DEFINER، تتجاوز RLS).
-- إشعارات الـ broadcast (إعلانات الأدمن) فقط للأدمن.
drop policy if exists "notifications_insert_admin" on public.notifications;
create policy "notifications_insert_admin" on public.notifications
  for insert with check (public.is_admin());

drop policy if exists "notifications_select_self" on public.notifications;
create policy "notifications_select_self" on public.notifications
  for select using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or user_id is null
    or public.is_admin()
  );

drop policy if exists "notifications_update_self" on public.notifications;
create policy "notifications_update_self" on public.notifications
  for update using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  )
  with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

drop policy if exists "notifications_delete_self" on public.notifications;
create policy "notifications_delete_self" on public.notifications
  for delete using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or public.is_admin()
  );


-- ============================================================
-- 2) BOOKING NOTIFICATIONS — توليد إشعارات تلقائياً عند حدث الحجز
-- ============================================================
create or replace function public.notify_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_user_id uuid;
  status_title text;
begin
  -- جلب صاحب المزود (المستخدم الذي يدير المزود)
  select p.user_id into provider_user_id
  from public.providers p
  where p.id = new.provider_id;

  -- (أ) حجز جديد
  if (TG_OP = 'INSERT') then
    -- إشعار للعميل: تأكيد إرسال الحجز
    insert into public.notifications (user_id, title, body, booking_id)
    values (
      new.user_id,
      'تم إرسال الحجز',
      'تم استلام طلبك "' || new.service_title || '" وهو قيد المراجعة',
      new.id
    );

    -- إشعار للمزود: طلب جديد
    if provider_user_id is not null then
      insert into public.notifications (user_id, title, body, booking_id)
      values (
        provider_user_id,
        'طلب حجز جديد',
        'لديك طلب حجز جديد للخدمة "' || new.service_title || '"',
        new.id
      );
    end if;

    return new;
  end if;

  -- (ب) تغيّر الحالة
  if (TG_OP = 'UPDATE') and (old.status is distinct from new.status) then
    status_title := case new.status
      when 'pending'   then 'بانتظار الرد'
      when 'accepted'  then 'تم قبول حجزك'
      when 'rejected'  then 'تم رفض حجزك'
      when 'completed' then 'تم إنهاء الخدمة'
      when 'cancelled' then 'تم إلغاء الحجز'
      else 'تحديث على حجزك'
    end;

    -- إشعار للعميل بأي تغيير في الحالة
    insert into public.notifications (user_id, title, body, booking_id)
    values (new.user_id, status_title, new.service_title, new.id);

    -- لو العميل ألغى الحجز، أبلغ المزود أيضاً
    if new.status = 'cancelled' and provider_user_id is not null then
      insert into public.notifications (user_id, title, body, booking_id)
      values (
        provider_user_id,
        'تم إلغاء طلب حجز',
        new.service_title,
        new.id
      );
    end if;

    return new;
  end if;

  return new;

exception when others then
  -- لا نمنع تنفيذ المعاملة لو فشل توليد الإشعار
  raise warning 'notify_booking_event failed for booking %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_bookings_notify on public.bookings;
create trigger trg_bookings_notify
  after insert or update of status on public.bookings
  for each row execute function public.notify_booking_event();


-- ============================================================
-- 3) إشعار ترحيب عند إنشاء صف public.users جديد
-- ============================================================
create or replace function public.welcome_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, body)
  values (
    new.id,
    'أهلاً بك في فرحتكم',
    'تصفّح أفضل مزودي الخدمات لتنظيم مناسبتك المثالية'
  );
  return new;
exception when others then
  raise warning 'welcome_new_user failed for user %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_users_welcome on public.users;
create trigger trg_users_welcome
  after insert on public.users
  for each row execute function public.welcome_new_user();


-- ============================================================
-- 4) USERS — حماية ضد تصعيد الدور إلى admin
-- ============================================================
-- المستخدم يقدر يحدّث ملفه، لكنه لا يقدر يجعل دوره admin.
-- (الـ admin يُمنح فقط من DB مباشرة أو سياسة منفصلة).
drop policy if exists "users_update_self" on public.users;
create policy "users_update_self" on public.users
  for update using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and role in ('customer'::user_role, 'provider'::user_role)
  );


-- ============================================================
-- 5) PROVIDER IMAGES — RLS وسياسات
-- ============================================================
alter table public.provider_images enable row level security;

drop policy if exists "provider_images_read_all" on public.provider_images;
create policy "provider_images_read_all" on public.provider_images
  for select using (true);

drop policy if exists "provider_images_self_write" on public.provider_images;
create policy "provider_images_self_write" on public.provider_images
  for all using (
    provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
    or public.is_admin()
  )
  with check (
    provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
    or public.is_admin()
  );


-- ============================================================
-- 6) REALTIME — تفعيل البث على الجداول المعنية
-- ============================================================
-- نُمكّن الـ Realtime على الجداول التي يستهلكها العميل لحظياً.
-- (Supabase يستخدم publication خاص اسمه supabase_realtime)
do $$ begin
  -- أضف الجدول إلى الـ publication لو لم يكن مضافاً بعد
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'services'
  ) then
    alter publication supabase_realtime add table public.services;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'providers'
  ) then
    alter publication supabase_realtime add table public.providers;
  end if;
exception when others then
  raise warning 'realtime publication setup failed: %', sqlerrm;
end $$;


-- ============================================================
-- ✅ جاهز. تحقق من:
--    • Database → Triggers: trg_bookings_notify + trg_users_welcome
--    • Database → Replication: bookings, notifications, services, providers
--    • Authentication → Policies: notifications (SELECT/UPDATE/DELETE فقط)
-- ============================================================
