-- ============================================================
-- فرح | Farah — Supabase Migration v4 (المرحلة 5: Booking flow)
-- نفّذ هذا الملف بعد migration_v3 في Supabase SQL Editor
-- ============================================================
-- يضيف:
--   • providers.working_hours  (JSONB: ساعات العمل لكل يوم في الأسبوع)
--   • services.duration_minutes (INT: مدة الخدمة بالدقائق — لحساب الـ slots)
--   • bookings.start_at + bookings.end_at (TIMESTAMPTZ)
--     ⚠️ يحذف الحقول القديمة `event_date` و `event_time` بعد التهجير
--   • bookings.payment_status + payment_method + payment_id
--     (لتكامل بوابة الدفع لاحقاً — الآن البنية فقط)
--   • EXCLUDE constraint يمنع تداخل الحجوزات على نفس المزود
--     في حالات pending أو accepted (يحجز الـ slot من pending)
--   • RPC `provider_busy_intervals` يرجع الفترات المحجوزة لمزود في يوم
--     (SECURITY DEFINER — لا يكشف بيانات العملاء)
-- ============================================================


-- ============================================================
-- 0) Extensions اللازمة
-- ============================================================
create extension if not exists "btree_gist";


-- ============================================================
-- 1) PROVIDERS.working_hours
-- ============================================================
-- شكل القيمة:
--   { "sun":["09:00","22:00"], "mon":["09:00","22:00"], ...,
--     "fri":["13:00","23:00"], "sat":["09:00","22:00"] }
-- يوم مغلق = null
alter table public.providers
  add column if not exists working_hours jsonb not null default jsonb_build_object(
    'sun', jsonb_build_array('09:00','22:00'),
    'mon', jsonb_build_array('09:00','22:00'),
    'tue', jsonb_build_array('09:00','22:00'),
    'wed', jsonb_build_array('09:00','22:00'),
    'thu', jsonb_build_array('09:00','22:00'),
    'fri', jsonb_build_array('13:00','23:00'),
    'sat', jsonb_build_array('09:00','22:00')
  );


-- ============================================================
-- 2) SERVICES.duration_minutes
-- ============================================================
alter table public.services
  add column if not exists duration_minutes int not null default 60
    check (duration_minutes between 15 and 1440);


-- ============================================================
-- 3) BOOKINGS — start_at / end_at + هجرة + حذف الحقول القديمة
-- ============================================================

-- أضف الأعمدة الجديدة
alter table public.bookings
  add column if not exists start_at timestamptz,
  add column if not exists end_at   timestamptz;

-- هجرة بيانات قديمة (إن وُجدت): event_date + 12:00 افتراضياً
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='bookings' and column_name='event_date'
  ) then
    update public.bookings b
       set start_at = ((b.event_date::text || ' 12:00:00')::timestamptz),
           end_at   = ((b.event_date::text || ' 13:00:00')::timestamptz)
     where b.start_at is null or b.end_at is null;
  end if;
end $$;

-- اجعل العمودين إلزامياً
alter table public.bookings
  alter column start_at set not null,
  alter column end_at   set not null;

-- شرط على المنطق
alter table public.bookings
  drop constraint if exists bookings_time_range_check;
alter table public.bookings
  add constraint bookings_time_range_check check (end_at > start_at);

-- اسقط الفهرس القديم على event_date إن وُجد
drop index if exists idx_bookings_date;
create index if not exists idx_bookings_start_at on public.bookings(start_at);

-- اسقط الحقول القديمة (نص حر لم يعد مفيداً)
alter table public.bookings drop column if exists event_date;
alter table public.bookings drop column if exists event_time;


-- ============================================================
-- 4) منع تداخل الحجوزات على نفس المزود (pending أو accepted)
-- ============================================================
-- نستخدم EXCLUDE constraint بدلاً من trigger:
--   • أسرع وأكثر أماناً (يعمل ضمن المعاملة بقفل الصف)
--   • يلتقط race conditions تلقائياً
alter table public.bookings
  drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    provider_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('pending'::booking_status, 'accepted'::booking_status));


-- ============================================================
-- 5) PAYMENT — حقول جاهزة للتكامل لاحقاً
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('pending', 'paid', 'refunded', 'failed');
  end if;
end $$;

alter table public.bookings
  add column if not exists payment_status payment_status not null default 'pending',
  add column if not exists payment_method text,
  add column if not exists payment_id text;

create index if not exists idx_bookings_payment_status on public.bookings(payment_status);


-- ============================================================
-- 6) RPC — جلب الفترات المحجوزة لمزود في يوم محدد
-- ============================================================
-- العميل يستدعي هذه الدالة لحساب الـ slots المتاحة للحجز.
-- لا تكشف بيانات العملاء (تُرجع فقط start/end).
create or replace function public.provider_busy_intervals(
  p_id uuid,
  day  date
)
returns table(start_at timestamptz, end_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.start_at, b.end_at
  from public.bookings b
  where b.provider_id = p_id
    and b.status in ('pending'::booking_status, 'accepted'::booking_status)
    and b.start_at::date = day
  order by b.start_at;
$$;

revoke all on function public.provider_busy_intervals(uuid, date) from public;
grant execute on function public.provider_busy_intervals(uuid, date) to authenticated, anon;


-- ============================================================
-- ✅ جاهز. تحقق من:
--    • Database → Tables → providers: العمود working_hours
--    • Database → Tables → services: العمود duration_minutes
--    • Database → Tables → bookings: start_at, end_at, payment_status
--    • Database → Functions: provider_busy_intervals
--    • Constraint: bookings_no_overlap (في تبويب Constraints على جدول bookings)
-- ============================================================
