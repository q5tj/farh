-- ============================================================
-- migration_v20: per-user read state for broadcast notifications
--
-- Problem: `adminBroadcastNotification` inserts ONE row with
-- `user_id = null` and every user sees it via the OR-clause in the
-- fetch query. But `is_read` is a single column on that single row —
-- so flipping it for one user flips it for everyone, and our
-- markAllNotificationsRead UPDATE filters by `user_id = userId` which
-- never matches the broadcast row, leaving broadcasts permanently
-- unread.
--
-- Fix: add a `notification_reads` join table that tracks (notification
-- id, user id) pairs. A notification is considered "read" if either:
--   • it's user-specific and `is_read=true`, OR
--   • it's a broadcast and a matching row exists in notification_reads.
-- Migrations also ship two RPCs the client now uses instead of the
-- ad-hoc queries:
--   • mark_all_notifications_read(p_user_id)  — flips user-specific
--      rows AND inserts notification_reads for unread broadcasts.
--   • fetch_user_notifications(p_user_id)     — returns the full feed
--      with an `effective_read` column.
-- ============================================================

begin;

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists idx_notification_reads_user
  on public.notification_reads(user_id);

alter table public.notification_reads enable row level security;

-- Each user manages their own read receipts. RLS keeps cross-user
-- writes impossible even via the REST API.
drop policy if exists "notification_reads_self_rw" on public.notification_reads;
create policy "notification_reads_self_rw" on public.notification_reads
  for all
  using (
    exists (
      select 1 from public.users u
      where u.id = notification_reads.user_id
        and u.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = notification_reads.user_id
        and u.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- RPC: mark_all_notifications_read
-- ============================================================
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
  -- AuthZ: caller must be the user being acted on (or admin).
  select id into v_caller_user_id
    from public.users where auth_user_id = auth.uid();
  if v_caller_user_id is null then raise exception 'unauthenticated'; end if;
  if v_caller_user_id <> p_user_id and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  -- 1) Flip user-specific notifications.
  update public.notifications
    set is_read = true
    where user_id = p_user_id and is_read = false;
  get diagnostics v_updated = row_count;

  -- 2) Record reads for every broadcast the user hasn't dismissed yet.
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

grant execute on function public.mark_all_notifications_read(uuid) to authenticated;

-- ============================================================
-- RPC: fetch_user_notifications
-- Returns the user's feed (their own rows + every broadcast) with an
-- `effective_read` boolean that consolidates both read mechanisms.
-- The client treats this as the source of truth for the UI.
-- ============================================================
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
  select id into v_caller_user_id
    from public.users where auth_user_id = auth.uid();
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

grant execute on function public.fetch_user_notifications(uuid, integer) to authenticated;

commit;
