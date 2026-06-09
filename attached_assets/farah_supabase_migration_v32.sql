-- ============================================================
-- migration_v32: overdue commission warnings + provider suspension
--
-- In the new payment model (v30) the platform's commission is owed by
-- the provider AFTER they mark a service completed. There is nothing
-- stopping a misbehaving provider from completing services and never
-- settling the commission — and since the platform never sees the
-- money, it cannot self-collect.
--
-- This migration adds the enforcement loop the T&Cs reference:
--
--   §1  providers gains `is_suspended` + `suspended_at` +
--       `suspension_reason`. A suspended provider is hidden from the
--       customer catalog and can't accept new bookings.
--
--   §2  A view `provider_commission_status` that, for every provider,
--       computes:
--         outstanding_sar  — sum of pending commission payments
--         oldest_due_at    — oldest unpaid commission's due date
--         days_overdue     — derived; powers the warning ladder
--
--   §3  `enforce_commission_overdue()` — cron-driven helper that runs
--       a ladder:
--         day 7  → notification "soft reminder"
--         day 14 → notification "warning: account will be suspended"
--         day 30 → suspend provider + notification "suspended"
--
--   §4  pg_cron schedule (best-effort; falls back to app-side trigger)
--
-- The day numbers default to 7/14/30 but live in `app_settings` so we
-- can tune them without redeploying.
-- ============================================================

begin;

-- ============================================================
-- §1  provider suspension columns
-- ============================================================
alter table public.providers
  add column if not exists is_suspended      boolean not null default false,
  add column if not exists suspended_at      timestamptz,
  add column if not exists suspension_reason text;

create index if not exists idx_providers_suspended
  on public.providers (is_suspended) where is_suspended = true;

-- Suspended providers vanish from the customer catalog. The provider
-- can still log in to their dashboard and pay the commission to lift
-- the suspension. We keep this surface tight by rewriting the catalog
-- policy in place.
-- Note: the enum is `verification_status`, not `provider_verification_status`
-- (the latter is the TS type name in the app; SQL keeps the original name).
drop policy if exists "providers_read_all" on public.providers;
drop policy if exists "providers_read_active" on public.providers;
create policy "providers_read_active" on public.providers
  for select using (
    -- Customers / public see only approved, active, NOT suspended
    (is_active = true
     and verification_status = 'approved'::verification_status
     and is_suspended = false)
    -- Provider owners always see their own row (so they can manage it)
    or user_id in (select id from public.users where auth_user_id = auth.uid())
    -- Admin sees everything
    or public.is_admin()
  );

-- ============================================================
-- §2  derived view: outstanding commission per provider
-- ============================================================
-- Commission rows live in `payments` with kind='provider_commission'.
-- Their due-date is approximated by `created_at` (the moment the
-- service was marked completed). When/if we add an explicit due_at
-- column we'll switch to that.
create or replace view public.provider_commission_status as
select
  p.id as provider_id,
  p.name,
  p.is_suspended,
  coalesce(sum(case
    when py.status in ('pending', 'initiated')
      then py.amount_halalas
    else 0
  end), 0) / 100.0 as outstanding_sar,
  min(case
    when py.status in ('pending', 'initiated')
      then py.created_at
    else null
  end) as oldest_due_at,
  extract(epoch from (now() - min(case
    when py.status in ('pending', 'initiated')
      then py.created_at
    else null
  end))) / 86400.0 as days_overdue
from public.providers p
left join public.payments py
  on py.provider_id = p.id
  and py.kind = 'provider_commission'::payment_kind
group by p.id, p.name, p.is_suspended;

grant select on public.provider_commission_status to authenticated;

-- ============================================================
-- §3  enforcement ladder
-- ============================================================
-- Returns the number of providers actioned in this pass (for logging).
create or replace function public.enforce_commission_overdue()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actioned    int := 0;
  v_reminder_d  int;
  v_warning_d   int;
  v_suspend_d   int;
  v_provider    record;
  v_user_id     uuid;
  v_lang        text;
  v_title       text;
  v_body        text;
begin
  v_reminder_d := coalesce(
    (select (value::text)::int from public.app_settings where key = 'commission_reminder_days'),
    7);
  v_warning_d  := coalesce(
    (select (value::text)::int from public.app_settings where key = 'commission_warning_days'),
    14);
  v_suspend_d  := coalesce(
    (select (value::text)::int from public.app_settings where key = 'commission_suspend_days'),
    30);

  for v_provider in
    select s.provider_id, s.outstanding_sar, s.days_overdue, p.is_suspended,
           p.user_id
    from public.provider_commission_status s
    join public.providers p on p.id = s.provider_id
    where s.outstanding_sar > 0
      and s.days_overdue is not null
  loop
    v_user_id := v_provider.user_id;
    v_lang := public.tx_user_lang(v_user_id);

    -- Suspension first (highest severity)
    if v_provider.days_overdue >= v_suspend_d and not v_provider.is_suspended then
      update public.providers
        set is_suspended = true,
            suspended_at = now(),
            suspension_reason = 'overdue_commission'
        where id = v_provider.provider_id;

      if v_lang = 'en' then
        v_title := 'Account suspended';
        v_body  := 'Your store has been suspended because the platform commission (' ||
          v_provider.outstanding_sar::text || ' SAR) has been outstanding for over ' ||
          v_suspend_d::text || ' days. Pay it from your dashboard to reactivate. Continued non-payment may result in legal action per the Terms of Service.';
      else
        v_title := 'تم تعليق حسابك';
        v_body  := 'تم تعليق متجرك لتأخر عمولة المنصة (' ||
          v_provider.outstanding_sar::text || ' ر.س) لأكثر من ' ||
          v_suspend_d::text || ' يوماً. ادفعها من لوحة التحكم لإعادة التفعيل. وفقاً للشروط، يحق للمنصة اتخاذ إجراءات قانونية في حال الاستمرار في عدم السداد.';
      end if;
      insert into public.notifications (user_id, title, body)
      values (v_user_id, v_title, v_body);
      v_actioned := v_actioned + 1;

    -- Warning
    elsif v_provider.days_overdue >= v_warning_d and v_provider.days_overdue < v_suspend_d then
      if v_lang = 'en' then
        v_title := 'Final warning: suspension imminent';
        v_body  := 'Platform commission (' || v_provider.outstanding_sar::text ||
          ' SAR) is overdue. Pay within ' || (v_suspend_d - v_provider.days_overdue::int)::text ||
          ' days to avoid suspension.';
      else
        v_title := 'إنذار أخير قبل التعليق';
        v_body  := 'عمولة المنصة (' || v_provider.outstanding_sar::text ||
          ' ر.س) متأخرة. سددها خلال ' || (v_suspend_d - v_provider.days_overdue::int)::text ||
          ' أيام لتجنّب تعليق حسابك.';
      end if;
      insert into public.notifications (user_id, title, body)
      values (v_user_id, v_title, v_body);
      v_actioned := v_actioned + 1;

    -- Soft reminder
    elsif v_provider.days_overdue >= v_reminder_d and v_provider.days_overdue < v_warning_d then
      if v_lang = 'en' then
        v_title := 'Commission overdue';
        v_body  := 'A platform commission of ' || v_provider.outstanding_sar::text ||
          ' SAR is awaiting settlement. Please pay it from your dashboard.';
      else
        v_title := 'عمولة المنصة بانتظار السداد';
        v_body  := 'عليك عمولة بقيمة ' || v_provider.outstanding_sar::text ||
          ' ر.س. سددها من لوحة التحكم.';
      end if;
      insert into public.notifications (user_id, title, body)
      values (v_user_id, v_title, v_body);
      v_actioned := v_actioned + 1;
    end if;
  end loop;

  return v_actioned;
end $$;

grant execute on function public.enforce_commission_overdue() to authenticated, anon;

-- Lift the suspension automatically when the provider settles their
-- outstanding commission. Called by the moyasar verify path after a
-- commission row flips to 'paid'.
create or replace function public.maybe_unsuspend_provider(p_provider_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outstanding numeric;
begin
  select outstanding_sar into v_outstanding
  from public.provider_commission_status
  where provider_id = p_provider_id;

  if coalesce(v_outstanding, 0) = 0 then
    update public.providers
      set is_suspended = false,
          suspended_at = null,
          suspension_reason = null
      where id = p_provider_id and is_suspended = true;
    return true;
  end if;
  return false;
end $$;

grant execute on function public.maybe_unsuspend_provider(uuid) to authenticated;

-- ============================================================
-- §4  scheduled enforcement (pg_cron if available)
-- ============================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Run once a day at 09:00 Asia/Riyadh = 06:00 UTC
    perform cron.schedule(
      'farah_commission_enforcement',
      '0 6 * * *',
      'select public.enforce_commission_overdue();'
    );
  else
    raise notice
      'pg_cron not installed — enable it to run the enforcement ladder automatically. Until then, call public.enforce_commission_overdue() from an admin button.';
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;

-- Defaults
insert into public.app_settings (key, value)
values
  ('commission_reminder_days', '7'),
  ('commission_warning_days', '14'),
  ('commission_suspend_days', '30')
on conflict (key) do nothing;

commit;
