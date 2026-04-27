-- ============================================================
-- فرحتكم | Farhatukum — Migration v7 (Cascade-delete hardening)
-- نفّذ بعد migration_v6 في SQL Editor
-- ============================================================
-- المشكلة: حذف مستخدم/مزود من الـ DB يفشل لأن:
--   • providers.user_id ON DELETE CASCADE يحاول مسح صف المزود
--   • لكن bookings.provider_id ON DELETE RESTRICT يمنع المسح
--     لو في حجوزات تشير لذاك المزود
--   • نفس المشكلة مع bookings.service_id
--
-- الحل: نحوّل العلاقتين إلى SET NULL ونجعل العمودين nullable.
-- النتيجة:
--   • مسح المزود ينجح ويحتفظ بسجلات الحجوزات للعملاء (service_title
--     و price مخزّنين كـ snapshot، لذا التاريخ يبقى مفهوم).
--   • نفس الشيء عند مسح خدمة.
-- ============================================================


-- ============================================================
-- 1) bookings.provider_id → SET NULL + nullable
-- ============================================================
alter table public.bookings
  drop constraint if exists bookings_provider_id_fkey;

alter table public.bookings
  alter column provider_id drop not null;

alter table public.bookings
  add constraint bookings_provider_id_fkey
  foreign key (provider_id) references public.providers(id)
  on delete set null;


-- ============================================================
-- 2) bookings.service_id → SET NULL + nullable
-- ============================================================
alter table public.bookings
  drop constraint if exists bookings_service_id_fkey;

alter table public.bookings
  alter column service_id drop not null;

alter table public.bookings
  add constraint bookings_service_id_fkey
  foreign key (service_id) references public.services(id)
  on delete set null;


-- ============================================================
-- 3) bookings_no_overlap — تجاهل الصفوف بدون مزود
-- ============================================================
-- الـ EXCLUDE constraint الحالي يطبّق على pending/accepted فقط.
-- مع ذلك، الصفوف اللي صار provider_id فيها NULL (بعد حذف المزود)
-- لن تتعارض مع أي حجز جديد لأن NULL = NULL يرجع UNKNOWN في
-- المقارنات. لكن يفضّل أيضاً استثنائها صراحةً لتجنب أي طارئ:
alter table public.bookings
  drop constraint if exists bookings_no_overlap;

alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    provider_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (
    status in ('pending'::booking_status, 'accepted'::booking_status)
    and provider_id is not null
  );


-- ============================================================
-- 4) tighten validate_booking_within_hours — provider_id may be null
-- ============================================================
-- الترايجر يقرأ working_hours من providers. لو provider_id NULL،
-- لن يجد صفًا، و hours = NULL، فيخرج بدون خطأ. السلوك صحيح فعلاً.
-- لا حاجة لتعديل، لكن نتأكد بإعادة تعريفه ليكون آمناً:
create or replace function public.validate_booking_within_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hours jsonb;
  weekday text;
  open_t time;
  close_t time;
  start_local time;
  end_local time;
begin
  if new.provider_id is null then return new; end if;

  select working_hours into hours from public.providers where id = new.provider_id;
  if hours is null then return new; end if;

  weekday := lower(to_char((new.start_at at time zone 'Asia/Riyadh'), 'dy'));
  if hours->weekday is null or jsonb_typeof(hours->weekday) <> 'array' then
    raise exception 'Provider closed on % (%)', weekday, new.start_at;
  end if;

  open_t := (hours->weekday->>0)::time;
  close_t := (hours->weekday->>1)::time;
  start_local := ((new.start_at at time zone 'Asia/Riyadh')::timestamp)::time;
  end_local := ((new.end_at at time zone 'Asia/Riyadh')::timestamp)::time;

  if start_local < open_t or end_local > close_t then
    raise exception 'Booking outside working hours (% - %)', open_t, close_t;
  end if;
  return new;
end $$;


-- ============================================================
-- ✅ Done. اختبر:
--
-- 1) من Supabase Studio، احذف مستخدم اختباري:
--    delete from auth.users where email = 'test@example.com';
--    -- يجب أن ينجح بدون خطأ "violates foreign key constraint".
--
-- 2) تحقق إن حجوزات العملاء بقيت (مع provider_id=null):
--    select id, user_id, provider_id, service_title, price
--    from bookings
--    where provider_id is null;
--    -- إن وُجدت، تعرف أنه تم HOL النقل بنجاح.
--
-- 3) سلسلة الـ cascade الكاملة لمستخدم:
--    auth.users → users → providers → SET NULL على bookings.provider_id
--                                  → CASCADE على services / provider_images
--                                  → CASCADE على reviews
--                       → CASCADE على bookings (التي يكون فيها هو العميل)
--                       → CASCADE على notifications, push_tokens,
--                         support_tickets, customer_favorites, rate_limits
-- ============================================================
