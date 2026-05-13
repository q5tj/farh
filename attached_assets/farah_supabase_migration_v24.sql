-- ============================================================
-- migration_v24: let admin users update their own profile
--
-- The v3 RLS policy `users_update_self` had a WITH CHECK clause that
-- restricted the post-update role to `customer` or `provider`, as a
-- defense against role-escalation attacks. The unintended side effect
-- was that admins also matched the restriction — and ANY self-update
-- they tried (e.g. flipping their UI language via setAppLanguage)
-- failed with 403 because their `admin` role isn't in the allowlist.
--
-- This migration relaxes the WITH CHECK so admins can keep `role =
-- admin` after an update, while still preventing a regular user from
-- flipping their own role to admin (the original intent).
-- ============================================================

begin;

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self" on public.users
  for update
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and (
      role in ('customer'::user_role, 'provider'::user_role)
      or public.is_admin()
    )
  );

commit;
