-- ============================================================
-- migration_v37: self-service account deletion
--
-- App Store Review Guideline 5.1.1(v) (effective June 30, 2022)
-- requires every app that supports account creation to also let the
-- user delete their account from within the app — not just the website.
-- Google Play has the same requirement.
--
-- The deletion RPC below runs SECURITY DEFINER so it can:
--   1. Sanity-check the caller (auth.uid() must match the user_id).
--   2. Refuse the deletion if it would orphan business obligations:
--        • bookings in pending/accepted state (not yet completed)
--        • unsettled provider commissions (only relevant to providers)
--      Customers with completed bookings and no pending state can leave
--      freely — historical rows stay (anonymised) for accounting.
--   3. Anonymise the public.users row instead of hard-deleting, so the
--      foreign keys on bookings / reviews / notifications stay valid
--      and historical records keep rendering ("مستخدم محذوف" appears).
--   4. Detach the auth.users row by clearing its email + flagging it
--      with a deletion marker — the next sign-in attempt fails cleanly.
--      Hard-deleting auth.users requires service_role, which we don't
--      want to expose through the user-scoped RPC; the anonymisation
--      is sufficient for compliance and prevents reuse of the email.
-- ============================================================

begin;

-- §1 -----------------------------------------------------------
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id    uuid;
  v_provider   record;
  v_pending    int;
  v_commission numeric;
  v_email_anon text;
begin
  -- AuthN
  select u.id into v_user_id
    from public.users u
    where u.auth_user_id = auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Reject if the user has bookings that are still in flight.
  select count(*) into v_pending
    from public.bookings b
    where b.user_id = v_user_id
      and b.status in ('pending'::booking_status, 'accepted'::booking_status);
  if v_pending > 0 then
    raise exception 'has_active_bookings';
  end if;

  -- If the user is a provider, refuse if there's any outstanding
  -- platform commission. They have to settle their debt before they
  -- can wipe the record that tracks it.
  select p.* into v_provider
    from public.providers p
    where p.user_id = v_user_id;
  if v_provider is not null then
    select coalesce(sum(amount_halalas), 0) / 100.0 into v_commission
      from public.payments py
      where py.provider_id = v_provider.id
        and py.kind = 'provider_commission'::payment_kind
        and py.status in ('pending', 'initiated');
    if v_commission > 0 then
      raise exception 'has_outstanding_commission';
    end if;

    -- Provider-side: also refuse if any accepted bookings exist (a
    -- customer counts on them showing up). They have to honor or
    -- reschedule the booking first.
    select count(*) into v_pending
      from public.bookings b
      where b.provider_id = v_provider.id
        and b.status in ('pending'::booking_status, 'accepted'::booking_status);
    if v_pending > 0 then
      raise exception 'provider_has_active_bookings';
    end if;
  end if;

  -- §2 Anonymise the public-facing data. We keep the row so FKs on
  -- historical bookings/reviews remain intact, but strip every
  -- personally identifiable field.
  v_email_anon := 'deleted-' || substr(replace(v_user_id::text, '-', ''), 1, 8) || '@deleted.farhatukum.com';

  update public.users
    set email      = v_email_anon,
        full_name  = 'مستخدم محذوف',
        phone      = null,
        avatar_url = null,
        gender     = null,
        age        = null,
        city       = null,
        profile_completed = false
    where id = v_user_id;

  -- Hide / disable any provider store the user owned.
  if v_provider is not null then
    update public.providers
      set is_active = false,
          is_suspended = true,
          suspension_reason = 'account_deleted',
          phone = null,
          email = v_email_anon,
          iban = null
      where id = v_provider.id;
  end if;

  -- §3 Detach the auth.users row. We can't DELETE from auth.users
  -- without service_role (Supabase intentionally locks that off from
  -- the user-facing SQL surface) but we CAN rewrite the email so the
  -- credential becomes unusable.
  update auth.users
    set email = v_email_anon,
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('deleted_at', now()::text)
    where id = auth.uid();

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'anonymised_email', v_email_anon
  );
end $$;

grant execute on function public.delete_my_account() to authenticated;

commit;
