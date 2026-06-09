-- ============================================================
-- migration_v27: drop unpaid bookings + expose a CTA window
--
-- v25 made the provider blind to unpaid bookings, but the *customer* was
-- still seeing the orphan row in their bookings list and the detail page
-- — with no way to pay, since the previous deposit flow only fires from
-- /booking-form on first submit. Customers who bailed out of Moyasar
-- ended up with a "Awaiting payment" booking they couldn't move forward.
--
-- This migration:
--
--   §1  A helper `cleanup_unpaid_bookings()` that hard-deletes bookings
--       where payment_status='pending' AND deposit_paid_at is null AND
--       they're older than 30 minutes. Safe to run repeatedly: it's
--       idempotent and only touches rows that never settled. Failed
--       payment rows are kept so admins can investigate.
--
--   §2  A scheduled job via pg_cron (if available) that runs the cleanup
--       every 5 minutes. If pg_cron isn't installed in this project the
--       app calls `cleanup_unpaid_bookings()` lazily on every customer
--       bookings list fetch — best-effort, but stops the customer from
--       seeing stale unpaid rows.
--
-- Note: the booking's busy-interval is released as soon as the row is
-- deleted, so the slot becomes available to the next customer. We did
-- NOT change the busy-intervals RPC — it already excludes deleted rows.
-- ============================================================

begin;

-- §1 ----------------------------------------------------------
-- Tunable: how long we wait before considering a payment "abandoned".
-- 30 minutes is generous (covers slow 3-D Secure flows) but short
-- enough that customers don't run into stale rows the next day.
create or replace function public.cleanup_unpaid_bookings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  with del as (
    delete from public.bookings
    where payment_status = 'pending'::payment_status
      and deposit_paid_at is null
      -- Only bookings still 'pending' on the workflow side. If the
      -- customer or provider already touched the booking (cancelled,
      -- accepted, etc.) we leave the row alone — surface it in admin.
      and status = 'pending'::booking_status
      and created_at < now() - interval '30 minutes'
    returning id
  )
  select count(*) into v_deleted from del;
  return v_deleted;
end $$;

grant execute on function public.cleanup_unpaid_bookings() to authenticated, anon;

-- §2 ----------------------------------------------------------
-- Best-effort scheduled cleanup. pg_cron is an extension that ships
-- with Supabase but the database owner has to enable it. We try to
-- create the schedule and swallow the error if the extension isn't
-- present — the lazy client-side call still works as a fallback.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'farah_cleanup_unpaid_bookings',
      '*/5 * * * *',
      'select public.cleanup_unpaid_bookings();'
    );
  else
    raise notice
      'pg_cron is not enabled — install it (Supabase: Database → Extensions) to auto-run cleanup. Until then the app falls back to lazy cleanup on every customer bookings fetch.';
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;

commit;
