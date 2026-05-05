-- ============================================================
-- فرحتكم | Farhatukum — Migration v14
-- نظام الرفض المزدوج: نهائي vs مطلوب تحديث بيانات
-- نفّذ بعد migration_v13 في SQL Editor
-- ============================================================
-- المتطلب:
--   1) "رفض نهائي" — النشاط لا يناسب التطبيق. لا تعديل، لا إعادة.
--      المستخدم يحتاج حساب جديد.
--   2) "مطلوب تحديث بيانات" — أخطاء/نقص في الإدخال (سجل تجاري منتهٍ،
--      صور غير واضحة، إلخ). المزود يقدر يعدّل ويعيد الإرسال للمراجعة.
--
-- الإضافات:
--   §1  قيمة جديدة 'needs_update' لـ verification_status enum
--   §2  تحديث notify_verification_change لتغطية الحالة الجديدة
--   §3  RPC admin_request_provider_update — ينقل الحالة لـ needs_update
--   §4  RPC provider_resubmit_for_review — يعيد needs_update إلى pending
-- ============================================================


-- ============================================================
-- §1 توسيع verification_status enum
-- ============================================================
-- ALTER TYPE … ADD VALUE لازم يكون out-of-transaction; نفّذها لحالها
-- إذا فشلت، شغّل السطر التالي من Editor قبل أي شي ثاني:
--    alter type verification_status add value if not exists 'needs_update';
do $$ begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'needs_update'
      and enumtypid = (select oid from pg_type where typname = 'verification_status')
  ) then
    alter type verification_status add value 'needs_update';
  end if;
exception when others then
  raise notice 'enum value addition deferred — run in its own transaction if needed';
end $$;


-- ============================================================
-- §2 trigger: تحديث الإشعارات لتدعم needs_update
-- ============================================================
create or replace function public.notify_verification_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title_text text;
  body_text text;
  display_name text;
begin
  if new.verification_status is not distinct from old.verification_status then
    return new;
  end if;
  if new.user_id is null then
    return new;
  end if;

  display_name := coalesce(new.name_ar, new.name, '');

  if new.verification_status = 'approved'::verification_status then
    title_text := 'تم اعتماد حسابك';
    body_text := case
      when display_name <> '' then 'تم اعتماد ' || display_name || ' وأصبح ظاهراً للعملاء'
      else 'تم اعتماد حسابك وأصبح ظاهراً للعملاء'
    end;
  elsif new.verification_status = 'rejected'::verification_status then
    title_text := 'تم رفض طلب الاعتماد';
    body_text := coalesce(
      nullif(trim(new.verification_rejection_reason), ''),
      'تواصل مع الدعم لمعرفة سبب الرفض. لإعادة المحاولة، أنشئ حساباً جديداً.'
    );
  elsif new.verification_status = 'needs_update'::verification_status then
    title_text := 'مطلوب تحديث بيانات حسابك';
    body_text := coalesce(
      nullif(trim(new.verification_rejection_reason), ''),
      'يرجى مراجعة بيانات حسابك وتحديث المستندات وإعادة الإرسال للمراجعة'
    );
  else
    return new; -- pending → no notification
  end if;

  insert into public.notifications (user_id, title, body, data)
  values (
    new.user_id,
    title_text,
    body_text,
    jsonb_build_object(
      'kind', 'verification_status',
      'provider_id', new.id,
      'status', new.verification_status::text
    )
  );

  return new;
end $$;


-- ============================================================
-- §3 admin_request_provider_update
-- ============================================================
create or replace function public.admin_request_provider_update(
  p_provider_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed_reason text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  trimmed_reason := nullif(trim(p_reason), '');
  if trimmed_reason is null then
    raise exception 'Reason is required for needs_update';
  end if;

  update public.providers
  set
    verification_status = 'needs_update'::verification_status,
    verification_rejection_reason = trimmed_reason
  where id = p_provider_id;
end $$;

revoke all on function public.admin_request_provider_update(uuid, text) from public;
grant execute on function public.admin_request_provider_update(uuid, text) to authenticated;


-- ============================================================
-- §4 provider_resubmit_for_review
-- ============================================================
-- يستدعيها المزود نفسه بعد تحديث بياناته. الـ SECURITY DEFINER يضمن
-- التحقق إن صف المزود يخصّه. ينقل الحالة من needs_update إلى pending
-- ويمسح سبب الرفض السابق.
create or replace function public.provider_resubmit_for_review()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_db_id uuid;
  affected_rows integer;
begin
  select id into current_user_db_id
  from public.users where auth_user_id = auth.uid();
  if current_user_db_id is null then
    raise exception 'No user record';
  end if;

  update public.providers
  set
    verification_status = 'pending'::verification_status,
    verification_rejection_reason = null
  where user_id = current_user_db_id
    and verification_status = 'needs_update'::verification_status;

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception 'No needs_update provider found for the current user';
  end if;
end $$;

revoke all on function public.provider_resubmit_for_review() from public;
grant execute on function public.provider_resubmit_for_review() to authenticated;


-- ============================================================
-- ✅ Done. اختبر:
--
-- 1) admin: من /admin/verifications، اختر مزوداً، اضغط "مطلوب تحديث"،
--    أدخل سبباً (مثلاً: "السجل التجاري منتهي الصلاحية") واحفظ.
-- 2) المزود يستلم إشعار "مطلوب تحديث بيانات حسابك"؛ يدخل التطبيق
--    فيُوجَّه لشاشة pending مع زر "تعديل البيانات".
-- 3) بعد التعديل وضغط "إعادة الإرسال للمراجعة" → تعود الحالة إلى
--    pending، والإشعار التالي يصل عند موافقة admin.
--
-- ملاحظة: لو ALTER TYPE … ADD VALUE فشل في الـ DO block، شغّل هذا
-- السطر لحاله أولاً ثم أعد تشغيل الباقي:
--    alter type verification_status add value if not exists 'needs_update';
-- ============================================================
