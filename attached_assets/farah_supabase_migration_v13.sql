-- ============================================================
-- فرحتكم | Farhatukum — Migration v13
-- admin_demote_provider — تنظيف كامل عند الإرجاع لعميل
-- نفّذ بعد migration_v12 في SQL Editor
-- ============================================================
-- المشكلة: لمّا الأدمن يرجع مزوداً إلى عميل، الكود الحالي كان فقط
-- يبدّل role في users، لكن صف public.providers يبقى قائمًا.
-- النتيجة: لمّا المستخدم يضغط "كن مزود خدمة" مرة ثانية، البوابة
-- ترى providerId قائمًا فترسله للوحة المزود مباشرة بدل تعبئة
-- النموذج من جديد.
--
-- الحل: RPC واحد ينفّذ التالي بـ atomicity:
--   1) يتحقق إن المنادي admin.
--   2) يحذف صف providers (الـ FKs الموجودة تتكفل بالباقي:
--      services / provider_images / reviews / provider_service_areas /
--      customer_favorites → CASCADE.
--      bookings.provider_id → SET NULL (من v7) فيبقى تاريخ العميل.
--   3) يحذف ملفات المزود من Storage في buckets الثلاث.
--   4) يحدّث users.role إلى 'customer'.
--   5) يسجّل في audit_log.
-- ============================================================

create or replace function public.admin_demote_provider(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  target_auth_user_id uuid;
  target_provider_id uuid;
  current_admin_user_id uuid;
  storage_objects_deleted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  select id into current_admin_user_id
  from public.users
  where auth_user_id = auth.uid();

  -- Look up the user + their provider row (if any).
  select u.auth_user_id, p.id
  into target_auth_user_id, target_provider_id
  from public.users u
  left join public.providers p on p.user_id = u.id
  where u.id = p_user_id;

  if target_auth_user_id is null then
    raise exception 'User % not found', p_user_id;
  end if;

  -- 1) Delete the provider row. ON DELETE rules handle the rest:
  --    services, provider_images, reviews, provider_service_areas,
  --    customer_favorites → CASCADE
  --    bookings.provider_id → SET NULL (preserves customer history)
  if target_provider_id is not null then
    delete from public.providers where id = target_provider_id;
  end if;

  -- 2) Storage cleanup — wipe everything this auth user uploaded to the
  --    three provider buckets. SECURITY DEFINER bypasses storage RLS.
  delete from storage.objects
  where bucket_id in ('provider-logos', 'provider-docs', 'provider-media')
    and (storage.foldername(name))[1] = target_auth_user_id::text;
  get diagnostics storage_objects_deleted = row_count;

  -- 3) Flip role back to customer.
  update public.users
  set role = 'customer'::user_role
  where id = p_user_id;

  -- 4) Audit log.
  insert into public.audit_log (
    actor_user_id, action, target_table, target_id, payload
  ) values (
    current_admin_user_id,
    'demote_provider',
    'users',
    p_user_id::text,
    jsonb_build_object(
      'deleted_provider_id', target_provider_id,
      'storage_objects_deleted', storage_objects_deleted
    )
  );

  return jsonb_build_object(
    'auth_user_id', target_auth_user_id,
    'deleted_provider_id', target_provider_id,
    'storage_objects_deleted', storage_objects_deleted
  );
end $$;

revoke all on function public.admin_demote_provider(uuid) from public;
grant execute on function public.admin_demote_provider(uuid) to authenticated;


-- ============================================================
-- ✅ Done. اختبر:
--
-- 1) من admin: ادخل /admin/users → اختر مزوداً → اضغط "إرجاع إلى عميل".
-- 2) تحقق:
--      select role from public.users where id = '<user_id>';   -- 'customer'
--      select * from public.providers where user_id = '<user_id>'; -- empty
--      select * from public.services where provider_id = '<old_provider_id>'; -- empty
-- 3) سجّل دخول كنفس المستخدم → "كن مزود خدمة" → يفتح نموذج الإعداد
--    من جديد بدلاً من لوحة التحكم.
-- ============================================================
