-- ============================================================
-- فرحتكم | Farhatukum — Migration v8 (Provider verification docs)
-- نفّذ بعد migration_v7 في SQL Editor
-- ============================================================
-- هذا الـ migration يضيف:
--   1) أعمدة لشعار المزود + 3 مستندات تحقق (السجل التجاري،
--      الرقم الضريبي، العنوان الوطني).
--   2) Storage buckets:
--        - provider-logos  (عام، يُعرض على البطاقات).
--        - provider-docs   (خاص، يقرأه المالك + الـ admin فقط).
--   3) سياسات RLS على Storage لكلا الـ buckets.
--   4) عمود data jsonb على notifications لتمرير metadata.
--   5) تحديث become_provider RPC لاستقبال الحقول الجديدة.
--   6) Trigger ينشئ Notification تلقائياً عند تغيّر
--      verification_status — هذا يلغي الحاجة إلى الإدراج اليدوي
--      من lib/data.ts ويجعل الـ realtime يعمل بدون انتظار
--      جلسة الـ admin.
-- ============================================================


-- ============================================================
-- §1 NEW PROVIDER COLUMNS
-- ============================================================
alter table public.providers
  add column if not exists logo_url text,
  add column if not exists commercial_registration_path text,
  add column if not exists tax_number_path text,
  add column if not exists national_address_path text,
  add column if not exists commission_rate_snapshot numeric(5,2),
  add column if not exists verification_rejection_reason text;

comment on column public.providers.logo_url is
  'Public URL in provider-logos bucket — shown on provider cards.';
comment on column public.providers.commercial_registration_path is
  'Storage object key in provider-docs bucket (private). Sign before serving.';
comment on column public.providers.tax_number_path is
  'Storage object key in provider-docs bucket (private). Sign before serving.';
comment on column public.providers.national_address_path is
  'Storage object key in provider-docs bucket (private). Sign before serving.';
comment on column public.providers.commission_rate_snapshot is
  'Commission rate (%) the provider accepted at signup. Defaults to current app_settings.commission_rate at insert time.';


-- ============================================================
-- §2 NOTIFICATIONS — data jsonb for routing metadata
-- ============================================================
alter table public.notifications
  add column if not exists data jsonb;

comment on column public.notifications.data is
  'Routing metadata (kind, ids, status). Read by client on tap to deep-link.';


-- ============================================================
-- §3 STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('provider-logos', 'provider-logos', true, 2097152,
    array['image/webp','image/jpeg','image/png']),
  ('provider-docs', 'provider-docs', false, 4194304,
    array['image/webp','image/jpeg','image/png','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================
-- §4 STORAGE RLS — provider-logos (public read, owner writes)
-- ============================================================
-- Layout: <auth_user_id>/logo.webp
-- Public reads work without an explicit policy because the bucket is public,
-- but storage.objects still requires a SELECT policy on the row level for
-- the API to serve metadata. Allow read when bucket is public:
drop policy if exists "logos_public_read" on storage.objects;
create policy "logos_public_read" on storage.objects
  for select
  using (bucket_id = 'provider-logos');

drop policy if exists "logos_owner_write" on storage.objects;
create policy "logos_owner_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'provider-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "logos_owner_update" on storage.objects;
create policy "logos_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'provider-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "logos_owner_delete" on storage.objects;
create policy "logos_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'provider-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================
-- §5 STORAGE RLS — provider-docs (private; owner + admin)
-- ============================================================
-- Layout: <auth_user_id>/cr.webp, <auth_user_id>/tax.webp, etc.
drop policy if exists "docs_owner_select" on storage.objects;
create policy "docs_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'provider-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "docs_owner_insert" on storage.objects;
create policy "docs_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'provider-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "docs_owner_update" on storage.objects;
create policy "docs_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'provider-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "docs_owner_delete" on storage.objects;
create policy "docs_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'provider-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================
-- §6 become_provider RPC — accept doc paths + snapshot commission
-- ============================================================
-- Drop the old signature so the new one can take its place cleanly.
drop function if exists public.become_provider(uuid, text, text, text, text, text);

create or replace function public.become_provider(
  p_category_id uuid,
  p_name text,
  p_description text default null,
  p_city text default null,
  p_phone text default null,
  p_email text default null,
  p_logo_url text default null,
  p_commercial_registration_path text default null,
  p_tax_number_path text default null,
  p_national_address_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  new_provider_id uuid;
  current_commission numeric(5,2);
begin
  select id into current_user_id
  from public.users where auth_user_id = auth.uid();
  if current_user_id is null then
    raise exception 'No user record';
  end if;
  if exists (select 1 from public.providers where user_id = current_user_id) then
    raise exception 'Already a provider';
  end if;

  -- Snapshot the current commission rate from app_settings (stored as jsonb).
  -- The text round-trip (jsonb → text → numeric) reliably parses primitive
  -- JSON numbers across Postgres versions.
  select coalesce((value::text)::numeric, 10)
  into current_commission
  from public.app_settings
  where key = 'commission_rate';

  insert into public.providers (
    user_id, category_id, name, name_ar,
    description, description_ar, city, phone, email,
    logo_url,
    commercial_registration_path,
    tax_number_path,
    national_address_path,
    commission_rate_snapshot,
    verification_status
  )
  values (
    current_user_id, p_category_id, p_name, p_name,
    p_description, p_description, p_city, p_phone, p_email,
    p_logo_url,
    p_commercial_registration_path,
    p_tax_number_path,
    p_national_address_path,
    coalesce(current_commission, 10),
    'pending'::verification_status
  )
  returning id into new_provider_id;

  update public.users set role = 'provider'::user_role where id = current_user_id;

  if p_city is not null then
    insert into public.provider_service_areas (provider_id, city)
    values (new_provider_id, p_city)
    on conflict do nothing;
  end if;

  return new_provider_id;
end $$;

revoke all on function public.become_provider(uuid, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.become_provider(uuid, text, text, text, text, text, text, text, text, text) to authenticated;


-- ============================================================
-- §7 VERIFICATION STATUS — auto-notify on change
-- ============================================================
-- When admin flips verification_status, fire a notification so the provider's
-- realtime channel (notifications table) lights up immediately. We do NOT
-- re-add providers to the realtime publication (v6 dropped it on purpose
-- because phone/email would leak row-by-row). The notification carries the
-- status in `data.kind = 'verification_status'`; the client refreshes the
-- profile/provider record on receipt.
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
      'تواصل مع الدعم لمعرفة سبب الرفض وتحديث المستندات'
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

drop trigger if exists trg_providers_notify_verification on public.providers;
create trigger trg_providers_notify_verification
  after update of verification_status on public.providers
  for each row execute function public.notify_verification_change();


-- ============================================================
-- ✅ Done. اختبر:
--
-- 1) من Storage تأكد إن provider-logos و provider-docs ظهروا.
-- 2) سجّل مستخدم جديد، اضغط "كن مزود خدمة"، ارفع شعار + 3 مستندات،
--    ثم تحقق إن:
--      select id, verification_status, logo_url,
--             commercial_registration_path, tax_number_path,
--             national_address_path, commission_rate_snapshot
--      from providers
--      order by created_at desc
--      limit 1;
--    يرجّع pending مع جميع المسارات + نسبة العمولة المسناب-شوت.
-- 3) من admin، وافق على المزود. الـ trigger يدرج إشعار جديد، والمزود
--    يستقبله realtime ولوحة التحكم تنفتح.
-- ============================================================
