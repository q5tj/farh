-- ============================================================
-- فرح | Farah — Supabase Migration v2 (Phase 1)
-- نفّذ هذا الملف في Supabase SQL Editor بعد ملف الـ schema الأصلي
-- يضيف: حقول الملف الشخصي، دعم اللغتين، Push tokens، تذاكر الدعم،
--        محتوى "حول التطبيق"، وتريغر تلقائي لإنشاء سجل المستخدم
-- ============================================================

-- ============================================================
-- 1) USERS — إضافة حقول الملف الشخصي
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'gender_type') then
    create type gender_type as enum ('male', 'female');
  end if;
  if not exists (select 1 from pg_type where typname = 'lang_code') then
    create type lang_code as enum ('ar', 'en');
  end if;
  if not exists (select 1 from pg_type where typname = 'ticket_status') then
    create type ticket_status as enum ('open', 'in_progress', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'push_platform') then
    create type push_platform as enum ('ios', 'android', 'web');
  end if;
end $$;

alter table public.users
  add column if not exists email text unique,
  add column if not exists avatar_url text,
  add column if not exists gender gender_type,
  add column if not exists age int check (age between 1 and 120),
  add column if not exists language lang_code default 'ar',
  add column if not exists profile_completed boolean not null default false;

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_profile_completed on public.users(profile_completed);

-- ============================================================
-- 2) CATEGORIES — دعم اللغتين
-- ============================================================

alter table public.categories
  add column if not exists name_ar text,
  add column if not exists name_en text;

-- اعتبار name الحالي هو الاسم بالعربي
update public.categories set name_ar = name where name_ar is null;

-- ============================================================
-- 3) PROVIDERS — دعم اللغتين
-- ============================================================

alter table public.providers
  add column if not exists name_ar text,
  add column if not exists name_en text,
  add column if not exists description_ar text,
  add column if not exists description_en text;

update public.providers set name_ar = name where name_ar is null;
update public.providers set description_ar = description where description_ar is null and description is not null;

-- ============================================================
-- 4) SERVICES — دعم اللغتين
-- ============================================================

alter table public.services
  add column if not exists title_ar text,
  add column if not exists title_en text,
  add column if not exists description_ar text,
  add column if not exists description_en text,
  add column if not exists images text[] default '{}'::text[],
  add column if not exists category_id uuid references public.categories(id) on delete set null;

update public.services set title_ar = title where title_ar is null;
update public.services set description_ar = description where description_ar is null and description is not null;

create index if not exists idx_services_category on public.services(category_id);

-- ============================================================
-- 5) PUSH TOKENS — لإشعارات Expo
-- ============================================================

create table if not exists public.push_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform push_platform not null,
  device_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists idx_push_tokens_user on public.push_tokens(user_id);
create index if not exists idx_push_tokens_active on public.push_tokens(is_active);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_self" on public.push_tokens;
create policy "push_tokens_select_self" on public.push_tokens
  for select using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "push_tokens_write_self" on public.push_tokens;
create policy "push_tokens_write_self" on public.push_tokens
  for all using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  )
  with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

drop trigger if exists trg_push_tokens_touch on public.push_tokens;
create trigger trg_push_tokens_touch before update on public.push_tokens
for each row execute function public.touch_updated_at();

-- ============================================================
-- 6) SUPPORT TICKETS — تذاكر الدعم الفني
-- ============================================================

create table if not exists public.support_tickets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  message text not null,
  -- snapshot للبيانات وقت إنشاء التذكرة (تظهر في لوحة الأدمن)
  user_role user_role not null,
  user_name text,
  user_email text,
  user_phone text,
  status ticket_status not null default 'open',
  admin_reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tickets_user on public.support_tickets(user_id);
create index if not exists idx_tickets_status on public.support_tickets(status);
create index if not exists idx_tickets_role on public.support_tickets(user_role);

alter table public.support_tickets enable row level security;

drop policy if exists "tickets_select_visible" on public.support_tickets;
create policy "tickets_select_visible" on public.support_tickets
  for select using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "tickets_insert_self" on public.support_tickets;
create policy "tickets_insert_self" on public.support_tickets
  for insert with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

drop policy if exists "tickets_update_admin" on public.support_tickets;
create policy "tickets_update_admin" on public.support_tickets
  for update using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_tickets_touch on public.support_tickets;
create trigger trg_tickets_touch before update on public.support_tickets
for each row execute function public.touch_updated_at();

-- ============================================================
-- 7) APP CONTENT — محتوى "حول التطبيق" قابل للتعديل من الأدمن
-- ============================================================

create table if not exists public.app_content (
  key text primary key,
  value_ar text not null default '',
  value_en text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.app_content (key, value_ar, value_en) values
  ('about_idea', 'فكرة التطبيق هي ربط أصحاب المناسبات بمزودي الخدمات بسهولة وموثوقية.', 'Farah connects event hosts with trusted service providers easily and reliably.'),
  ('about_goal', 'هدفنا: تجربة حجز سلسة لكل خدمات الأفراح والمناسبات في مكان واحد.', 'Our goal: a seamless booking experience for all wedding and event services in one place.'),
  ('about_how',  'تختار التصنيف، تتصفح المزودين، تحجز، ويتم التأكيد بإشعار مباشر.', 'Pick a category, browse providers, book, and get instant confirmation via push notification.')
on conflict (key) do nothing;

alter table public.app_content enable row level security;

drop policy if exists "app_content_read_all" on public.app_content;
create policy "app_content_read_all" on public.app_content for select using (true);

drop policy if exists "app_content_write_admin" on public.app_content;
create policy "app_content_write_admin" on public.app_content
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 8) AUTO-CREATE public.users ROW عند تسجيل مستخدم جديد في auth.users
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (auth_user_id, email, role, language, profile_completed)
  values (new.id, new.email, 'customer'::user_role, 'ar'::lang_code, false)
  on conflict (auth_user_id) do nothing;
  return new;
exception when others then
  -- لا تمنع تسجيل المستخدم في auth.users لو فشل إنشاء صف public.users.
  -- السبب يُسجَّل في الـ Database logs ويمكن إصلاحه لاحقاً.
  raise warning 'handle_new_auth_user failed for %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================================
-- 9) أذونات INSERT/SELECT الناقصة على users (تم إنشاؤها سابقاً بدون insert policy)
-- ============================================================

drop policy if exists "users_insert_self" on public.users;
create policy "users_insert_self" on public.users
  for insert with check (auth_user_id = auth.uid());

-- ============================================================
-- ✅ جاهز. تحقق من الجداول الجديدة في Supabase Studio.
-- ============================================================
