-- ============================================================
-- فرح | Farah — Supabase Schema (PostgreSQL + Row Level Security)
-- انسخ هذا الملف بالكامل في SQL Editor داخل Supabase ثم نفّذه
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('customer', 'provider', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type booking_status as enum ('pending', 'accepted', 'rejected', 'completed', 'cancelled');
  end if;
end $$;

-- ============================================================
-- TABLES
-- ============================================================

-- ملفات المستخدمين (مرتبط بـ auth.users في Supabase)
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  phone text unique,
  full_name text,
  role user_role not null default 'customer',
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_role on public.users(role);
create index if not exists idx_users_phone on public.users(phone);

-- التصنيفات (يمكن إضافتها وتعديلها من لوحة التحكم بدون تعديل الكود)
create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  icon text,
  color text default '#7b2cbf',
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_active on public.categories(is_active);
create index if not exists idx_categories_slug on public.categories(slug);

-- مزودو الخدمة
create table if not exists public.providers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  description text,
  city text,
  phone text,
  email text,
  cover_url text,
  rating_avg numeric(3,2) default 0,
  rating_count int default 0,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_providers_category on public.providers(category_id);
create index if not exists idx_providers_city on public.providers(city);
create index if not exists idx_providers_active on public.providers(is_active);
create index if not exists idx_providers_user on public.providers(user_id);

-- صور معرض المزود
create table if not exists public.provider_images (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  url text not null,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_images_provider on public.provider_images(provider_id);

-- الخدمات والأسعار
create table if not exists public.services (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  title text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  duration text,
  is_active boolean default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_services_provider on public.services(provider_id);
create index if not exists idx_services_active on public.services(is_active);

-- الحجوزات
create table if not exists public.bookings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  service_title text not null, -- snapshot
  price numeric(10,2) not null check (price >= 0), -- snapshot
  event_date date not null,
  event_time text,
  city text,
  address text,
  notes text,
  status booking_status not null default 'pending',
  commission_rate numeric(5,2) default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bookings_user on public.bookings(user_id);
create index if not exists idx_bookings_provider on public.bookings(provider_id);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_bookings_date on public.bookings(event_date);

-- التقييمات
create table if not exists public.reviews (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_provider on public.reviews(provider_id);
create index if not exists idx_reviews_user on public.reviews(user_id);

-- الإشعارات
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade, -- null = broadcast
  title text not null,
  body text,
  booking_id uuid references public.bookings(id) on delete set null,
  is_read boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications(user_id);
create index if not exists idx_notifications_read on public.notifications(is_read);

-- إعدادات المنصة (نسبة العمولة العامة وغيرها)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('commission_rate', '10'::jsonb)
on conflict (key) do nothing;

-- ============================================================
-- TRIGGERS — تحديث التقييم تلقائيًا عند كل تقييم جديد
-- ============================================================
create or replace function public.refresh_provider_rating()
returns trigger language plpgsql as $$
begin
  update public.providers p set
    rating_avg = coalesce((select avg(rating)::numeric(3,2) from public.reviews where provider_id = p.id), 0),
    rating_count = (select count(*) from public.reviews where provider_id = p.id),
    updated_at = now()
  where p.id = new.provider_id;
  return new;
end $$;

drop trigger if exists trg_refresh_rating on public.reviews;
create trigger trg_refresh_rating
after insert or update or delete on public.reviews
for each row execute function public.refresh_provider_rating();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_users_touch on public.users;
create trigger trg_users_touch before update on public.users
for each row execute function public.touch_updated_at();

drop trigger if exists trg_providers_touch on public.providers;
create trigger trg_providers_touch before update on public.providers
for each row execute function public.touch_updated_at();

drop trigger if exists trg_bookings_touch on public.bookings;
create trigger trg_bookings_touch before update on public.bookings
for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (مهم للأمان)
-- ============================================================
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.providers enable row level security;
alter table public.provider_images enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.app_settings enable row level security;

-- helper: هل المستخدم الحالي مالك (admin)؟
create or replace function public.is_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'admin'
  );
$$;

-- USERS
drop policy if exists "users_select_own_or_admin" on public.users;
create policy "users_select_own_or_admin" on public.users
  for select using (auth_user_id = auth.uid() or public.is_admin());

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self" on public.users
  for update using (auth_user_id = auth.uid());

-- CATEGORIES (قراءة عامة، تعديل للأدمن فقط)
drop policy if exists "categories_read_all" on public.categories;
create policy "categories_read_all" on public.categories for select using (true);

drop policy if exists "categories_write_admin" on public.categories;
create policy "categories_write_admin" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- PROVIDERS (قراءة عامة)
drop policy if exists "providers_read_all" on public.providers;
create policy "providers_read_all" on public.providers for select using (true);

drop policy if exists "providers_self_write" on public.providers;
create policy "providers_self_write" on public.providers
  for all using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or public.is_admin()
  )
  with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or public.is_admin()
  );

-- SERVICES (قراءة عامة، الكتابة لمالك المزود أو الأدمن)
drop policy if exists "services_read_all" on public.services;
create policy "services_read_all" on public.services for select using (true);

drop policy if exists "services_self_write" on public.services;
create policy "services_self_write" on public.services
  for all using (
    provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
    or public.is_admin()
  );

-- BOOKINGS (العميل يرى حجوزاته، المزود يرى حجوزاته، الأدمن يرى الكل)
drop policy if exists "bookings_select_visible" on public.bookings;
create policy "bookings_select_visible" on public.bookings
  for select using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "bookings_insert_self" on public.bookings;
create policy "bookings_insert_self" on public.bookings
  for insert with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

drop policy if exists "bookings_update_visible" on public.bookings;
create policy "bookings_update_visible" on public.bookings
  for update using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
    or public.is_admin()
  );

-- REVIEWS
drop policy if exists "reviews_read_all" on public.reviews;
create policy "reviews_read_all" on public.reviews for select using (true);

drop policy if exists "reviews_insert_owner" on public.reviews;
create policy "reviews_insert_owner" on public.reviews
  for insert with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

-- NOTIFICATIONS (المستخدم يرى إشعاراته فقط، الأدمن يرسل للجميع)
drop policy if exists "notifications_select_self" on public.notifications;
create policy "notifications_select_self" on public.notifications
  for select using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or user_id is null
    or public.is_admin()
  );

drop policy if exists "notifications_insert_admin" on public.notifications;
create policy "notifications_insert_admin" on public.notifications
  for insert with check (public.is_admin());

drop policy if exists "notifications_update_self" on public.notifications;
create policy "notifications_update_self" on public.notifications
  for update using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

-- APP SETTINGS
drop policy if exists "settings_read_all" on public.app_settings;
create policy "settings_read_all" on public.app_settings for select using (true);

drop policy if exists "settings_write_admin" on public.app_settings;
create policy "settings_write_admin" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- SEED — بيانات أولية للتصنيفات
-- ============================================================
insert into public.categories (name, slug, icon, color) values
  ('الشعراء', 'poets', 'feather', '#7b2cbf'),
  ('شعراء العرضة', 'ardha-poets', 'mic', '#9d4edd'),
  ('المنشدين', 'munshideen', 'music', '#5a189a'),
  ('فرق الدمة والشيلات', 'dama-shilat', 'users', '#7b2cbf'),
  ('الطبول والصفوف', 'drums', 'disc', '#9d4edd'),
  ('القهوجية', 'qahwaji', 'coffee', '#a16207'),
  ('الصوتيات', 'audio', 'volume-2', '#5a189a'),
  ('تصوير فوتوغرافي', 'photo', 'camera', '#7b2cbf'),
  ('تصوير فيديو', 'video', 'video', '#9d4edd'),
  ('المصورات', 'female-photo', 'aperture', '#c026d3'),
  ('قاعات وقصور الأفراح', 'halls', 'home', '#5a189a'),
  ('المطاعم', 'restaurants', 'coffee', '#dc2626'),
  ('الكافيهات', 'cafes', 'coffee', '#a16207'),
  ('الأكلات الشعبية', 'popular-food', 'shopping-bag', '#ea580c'),
  ('محلات الورود', 'flowers', 'gift', '#db2777'),
  ('محلات الحلويات', 'sweets', 'gift', '#e11d48'),
  ('تجهيز ومداخل الزواج', 'wedding-prep', 'star', '#7b2cbf'),
  ('الفرش والمستلزمات', 'furniture', 'package', '#5a189a'),
  ('القسم النسائي', 'women-section', 'heart', '#c026d3'),
  ('تنسيق وتنظيم الحفلات', 'organizers', 'award', '#9d4edd')
on conflict (slug) do nothing;
