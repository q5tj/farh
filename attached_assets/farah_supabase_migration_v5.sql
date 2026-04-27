-- ============================================================
-- فرحتكم | Farhatukum — Supabase Migration v5
-- نفّذ هذا الملف بعد migration_v4 في SQL Editor
-- ============================================================
-- يضيف:
--   • trigger: عند رد الأدمن على تذكرة دعم → إشعار للمستخدم
--   • ترجمة إنجليزية لكل التصنيفات الافتراضية الـ 20
--   • تفعيل Realtime على support_tickets (لتحديث قائمة "تذاكري" لحظياً)
--   • سياسة admin لتحديث دور أي مستخدم (لميزة الترقية في لوحة الأدمن)
-- ============================================================


-- ============================================================
-- 1) TICKET REPLY NOTIFICATION TRIGGER
-- ============================================================
-- لما الأدمن يحدث `admin_reply` على تذكرة، يُولَّد إشعار تلقائياً
-- للمستخدم صاحب التذكرة. SECURITY DEFINER يتجاوز RLS ليكتب الإشعار.
create or replace function public.notify_ticket_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- نُولّد إشعار فقط عند تغيّر الرد إلى نص غير فارغ
  if (
    (old.admin_reply is distinct from new.admin_reply)
    and new.admin_reply is not null
    and length(trim(new.admin_reply)) > 0
  ) then
    insert into public.notifications (user_id, title, body)
    values (
      new.user_id,
      'تم الرد على تذكرتك',
      coalesce(new.subject, 'افتح تذاكر الدعم لقراءة الرد')
    );
  end if;
  return new;

exception when others then
  raise warning 'notify_ticket_reply failed for ticket %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_tickets_reply_notify on public.support_tickets;
create trigger trg_tickets_reply_notify
  after update on public.support_tickets
  for each row execute function public.notify_ticket_reply();


-- ============================================================
-- 2) ENGLISH NAMES FOR DEFAULT CATEGORIES
-- ============================================================
-- نملأ `name_en` للتصنيفات الافتراضية الـ20 (slug ثابت).
update public.categories set name_en = 'Poets'                     where slug = 'poets';
update public.categories set name_en = 'Ardha Poets'               where slug = 'ardha-poets';
update public.categories set name_en = 'Munshideen'                where slug = 'munshideen';
update public.categories set name_en = 'Damma & Shilat Bands'      where slug = 'dama-shilat';
update public.categories set name_en = 'Drums & Lines'             where slug = 'drums';
update public.categories set name_en = 'Coffee Servers'            where slug = 'qahwaji';
update public.categories set name_en = 'Audio Systems'             where slug = 'audio';
update public.categories set name_en = 'Photography'               where slug = 'photo';
update public.categories set name_en = 'Videography'               where slug = 'video';
update public.categories set name_en = 'Female Photographers'      where slug = 'female-photo';
update public.categories set name_en = 'Wedding Halls & Palaces'   where slug = 'halls';
update public.categories set name_en = 'Restaurants'               where slug = 'restaurants';
update public.categories set name_en = 'Cafes'                     where slug = 'cafes';
update public.categories set name_en = 'Traditional Food'          where slug = 'popular-food';
update public.categories set name_en = 'Florists'                  where slug = 'flowers';
update public.categories set name_en = 'Sweets'                    where slug = 'sweets';
update public.categories set name_en = 'Wedding Decor & Entrances' where slug = 'wedding-prep';
update public.categories set name_en = 'Furniture & Supplies'      where slug = 'furniture';
update public.categories set name_en = 'Women Section'             where slug = 'women-section';
update public.categories set name_en = 'Event Planners'            where slug = 'organizers';


-- ============================================================
-- 3) REALTIME on support_tickets
-- ============================================================
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;
end $$;


-- ============================================================
-- 4) ADMIN can update any user's role (customer ↔ provider only)
-- ============================================================
-- بدون هذي السياسة، لوحة الأدمن لا تقدر ترقي مستخدم لأن
-- `users_update_self` تطبّق `auth_user_id = auth.uid()` فقط.
drop policy if exists "users_update_admin" on public.users;
create policy "users_update_admin" on public.users
  for update using (public.is_admin())
  with check (
    public.is_admin()
    -- نسمح فقط بأدوار customer/provider — لا يستطيع الأدمن منح admin
    -- لمستخدم آخر من الواجهة (يبقى admin يُمنح من DB مباشرة).
    and role in ('customer'::user_role, 'provider'::user_role)
  );


-- ============================================================
-- ✅ جاهز.
-- بعد تنفيذها:
--   • أي رد على تذكرة دعم سيُنشئ إشعار للمستخدم تلقائياً
--   • التصنيفات تظهر بالإنجليزية لما يفتح المستخدم بـ language=en
--   • قائمة "تذاكري" تتحدّث لحظياً عبر Realtime
--   • الأدمن يقدر يرقي/يرجع دور أي مستخدم من اللوحة
-- ============================================================
