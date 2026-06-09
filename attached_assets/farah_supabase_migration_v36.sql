-- ============================================================
-- migration_v36: fix "column reference 'id' is ambiguous" in
-- fetch_user_notifications
--
-- The v20 definition uses `RETURNS TABLE(id uuid, ...)`. Inside a
-- plpgsql function, every column declared in RETURNS TABLE is
-- exposed as an OUT parameter — a local variable inside the function
-- body. When the body then does:
--
--     select id into v_caller_user_id from public.users where ...
--
-- Postgres can't tell whether `id` is the OUT parameter or the
-- `public.users.id` column, so it raises:
--
--     ERROR  column reference "id" is ambiguous
--
-- The client falls back to a direct SELECT — read state still works,
-- but every notifications fetch hits the network with a 400 first.
--
-- Fix: alias the table in the lookup so the column is fully qualified
-- (`u.id`). Same idea applied to `mark_all_notifications_read` for
-- consistency, even though it didn't trigger the bug — it's still
-- good hygiene.
-- ============================================================

begin;

create or replace function public.fetch_user_notifications(
  p_user_id uuid,
  p_limit integer default 100
) returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  title_ar text,
  title_en text,
  body_ar text,
  body_en text,
  booking_id uuid,
  is_read boolean,
  effective_read boolean,
  created_at timestamptz
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid;
begin
  -- Qualify with `u.` so Postgres doesn't confuse this with the
  -- function's OUT-parameter `id`.
  select u.id into v_caller_user_id
    from public.users u
    where u.auth_user_id = auth.uid();
  if v_caller_user_id is null then raise exception 'unauthenticated'; end if;
  if v_caller_user_id <> p_user_id and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
    select
      n.id, n.user_id, n.title, n.body,
      n.title_ar, n.title_en, n.body_ar, n.body_en,
      n.booking_id, n.is_read,
      (case
         when n.user_id is null then exists (
           select 1 from public.notification_reads r
           where r.notification_id = n.id and r.user_id = p_user_id
         )
         else coalesce(n.is_read, false)
       end) as effective_read,
      n.created_at
    from public.notifications n
    where n.user_id = p_user_id or n.user_id is null
    order by n.created_at desc
    limit p_limit;
end $$;

grant execute on function public.fetch_user_notifications(uuid, integer)
  to authenticated;

create or replace function public.mark_all_notifications_read(
  p_user_id uuid
) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid;
  v_count integer := 0;
  v_updated integer := 0;
  v_inserted integer := 0;
begin
  select u.id into v_caller_user_id
    from public.users u
    where u.auth_user_id = auth.uid();
  if v_caller_user_id is null then raise exception 'unauthenticated'; end if;
  if v_caller_user_id <> p_user_id and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  update public.notifications
    set is_read = true
    where user_id = p_user_id and is_read = false;
  get diagnostics v_updated = row_count;

  insert into public.notification_reads (notification_id, user_id)
  select n.id, p_user_id
    from public.notifications n
    where n.user_id is null
      and not exists (
        select 1 from public.notification_reads r
        where r.notification_id = n.id and r.user_id = p_user_id
      );
  get diagnostics v_inserted = row_count;

  v_count := v_updated + v_inserted;
  return v_count;
end $$;

grant execute on function public.mark_all_notifications_read(uuid)
  to authenticated;

commit;
