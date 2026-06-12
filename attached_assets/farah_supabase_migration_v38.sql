-- ============================================================
-- migration_v38: fix Security Advisor warning on
-- public.provider_commission_status
--
-- Supabase's Security Advisor flags any view that runs with the
-- creator's privileges as a CRITICAL issue, because such a view
-- silently bypasses the RLS policies of the calling user. The view
-- we created in v32 was created with the default behaviour, which
-- on Postgres before the `security_invoker` option used to be the
-- only behaviour, and is still the default on `CREATE VIEW` unless
-- explicitly opted out.
--
-- The fix is to recreate the view with `WITH (security_invoker = true)`
-- (Postgres 15+, which Supabase ships). The view's SELECT will then
-- run as the querying user, and the RLS policies on `providers` and
-- `payments` will gate visibility correctly.
--
-- Authorization model for the new view:
--   • Provider owners can see their own row (matches
--     providers_read_active policy + payments_select_own).
--   • Admins can see everything (via the is_admin() arm of those
--     policies).
--   • Anyone else who somehow queries the view will simply get an
--     empty result, because the underlying SELECT returns no rows
--     they're allowed to read.
--
-- Side effect: the cron-driven enforce_commission_overdue() function
-- now needs to bypass RLS on its own — but it already runs as
-- SECURITY DEFINER, so it has full access regardless of the view's
-- invoker mode.
-- ============================================================

begin;

-- Recreate the view with the safer security_invoker mode.
drop view if exists public.provider_commission_status;

create view public.provider_commission_status
with (security_invoker = true)
as
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

-- enforce_commission_overdue() reads the view internally. Because
-- the function is SECURITY DEFINER it always saw all rows, so
-- switching the view to security_invoker would normally hide rows
-- from it. We rewrite the function to inline the same aggregation
-- against the base tables and skip the view, so it stays correct.
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
    with agg as (
      select
        p.id as provider_id,
        p.is_suspended,
        p.user_id,
        coalesce(sum(case when py.status in ('pending', 'initiated')
                          then py.amount_halalas else 0 end), 0) / 100.0
          as outstanding_sar,
        min(case when py.status in ('pending', 'initiated')
                 then py.created_at else null end) as oldest_due_at
      from public.providers p
      left join public.payments py
        on py.provider_id = p.id
        and py.kind = 'provider_commission'::payment_kind
      group by p.id, p.is_suspended, p.user_id
    )
    select
      a.provider_id,
      a.outstanding_sar,
      a.is_suspended,
      a.user_id,
      extract(epoch from (now() - a.oldest_due_at)) / 86400.0 as days_overdue
    from agg a
    where a.outstanding_sar > 0
      and a.oldest_due_at is not null
  loop
    v_user_id := v_provider.user_id;
    v_lang := public.tx_user_lang(v_user_id);

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

-- maybe_unsuspend_provider also reads the view; rewrite to use the
-- base tables directly so it doesn't depend on the new invoker mode.
create or replace function public.maybe_unsuspend_provider(p_provider_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outstanding numeric;
begin
  select coalesce(sum(amount_halalas), 0) / 100.0
    into v_outstanding
    from public.payments
    where provider_id = p_provider_id
      and kind = 'provider_commission'::payment_kind
      and status in ('pending', 'initiated');

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

commit;
