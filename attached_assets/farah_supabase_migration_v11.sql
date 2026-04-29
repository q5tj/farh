-- ============================================================
-- فرحتكم | Farhatukum — Migration v11
-- Per-booking commission accounting
-- نفّذ بعد migration_v10 في SQL Editor
-- ============================================================
-- This migration adds true per-booking commission tracking so the admin
-- can settle owed amounts with each provider individually instead of
-- relying on a coarse aggregate. Highlights:
--   §1  commission_status enum (owed / paid / waived) — idempotent
--   §2  bookings        → commission_status / paid_at / paid_by /
--                          payment_note / commission_amount snapshot
--   §3  trigger          → set_commission_on_status_change keeps the
--                          per-booking commission state in sync with
--                          booking.status flips.
--   §4  backfill         → seed commission_amount + commission_status
--                          for existing rows so the admin UI shows real
--                          history right away.
--   §5  index            → idx_bookings_commission_owed (partial)
--   §6  RPCs / view      → admin_set_commission_status +
--                          provider_financial_summary helper.
-- ============================================================


-- ============================================================
-- §1 commission_status ENUM
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'commission_status') then
    create type commission_status as enum ('owed','paid','waived');
  end if;
end $$;


-- ============================================================
-- §2 BOOKINGS — commission accounting columns
-- ============================================================
alter table public.bookings
  add column if not exists commission_status commission_status not null default 'owed',
  add column if not exists commission_paid_at timestamptz,
  add column if not exists commission_paid_by uuid references public.users(id) on delete set null,
  add column if not exists commission_payment_note text,
  add column if not exists commission_amount numeric(10,2);

comment on column public.bookings.commission_status is
  'owed | paid | waived — admin-managed commission settlement state.';
comment on column public.bookings.commission_amount is
  'Snapshotted at completion: price * commission_rate / 100. Frozen.';
comment on column public.bookings.commission_paid_by is
  'users.id of the admin who marked the commission paid.';


-- ============================================================
-- §3 TRIGGER — set_commission_on_status_change
-- ============================================================
-- When booking.status flips:
--   * → completed   : if waived, leave alone; else owed + snapshot amount
--   * → cancelled / rejected (and not already paid) : waive
-- The trigger only fires when status actually changed, so manual edits to
-- commission_status (via the admin RPC) are not clobbered.
create or replace function public.set_commission_on_status_change()
returns trigger language plpgsql as $$
declare
  rate numeric(5,2);
begin
  if new.status is distinct from old.status then
    if new.status = 'completed'::booking_status then
      if new.commission_status <> 'waived'::commission_status then
        rate := coalesce(new.commission_rate, 10);
        new.commission_status := 'owed'::commission_status;
        new.commission_amount := round((new.price * rate / 100)::numeric, 2);
      end if;
    elsif new.status in ('cancelled'::booking_status, 'rejected'::booking_status) then
      if new.commission_status <> 'paid'::commission_status then
        new.commission_status := 'waived'::commission_status;
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_commission_status on public.bookings;
create trigger trg_bookings_commission_status
  before update of status on public.bookings
  for each row execute function public.set_commission_on_status_change();


-- ============================================================
-- §4 BACKFILL — seed amount + status for existing rows
-- ============================================================
-- Completed bookings → owed (snapshot the amount from current rate).
update public.bookings
set
  commission_amount = round((price * coalesce(commission_rate, 10) / 100)::numeric, 2),
  commission_status = 'owed'::commission_status
where status = 'completed'::booking_status
  and (commission_amount is null or commission_amount = 0);

-- Cancelled / rejected → waived (no money owed, snapshot for history).
update public.bookings
set
  commission_amount = round((price * coalesce(commission_rate, 10) / 100)::numeric, 2),
  commission_status = 'waived'::commission_status
where status in ('cancelled'::booking_status, 'rejected'::booking_status)
  and commission_status <> 'paid'::commission_status;

-- Pending / accepted → owed placeholder amount, status owed (won't be due
-- until completion, but having the amount visible helps forecasting).
update public.bookings
set
  commission_amount = round((price * coalesce(commission_rate, 10) / 100)::numeric, 2)
where commission_amount is null;


-- ============================================================
-- §5 INDEX — fast lookup of owed-per-provider
-- ============================================================
create index if not exists idx_bookings_commission_owed
  on public.bookings(provider_id)
  where commission_status = 'owed'::commission_status;


-- ============================================================
-- §6 RPCs + view
-- ============================================================

-- 6.1 admin_set_commission_status — admin-only setter that writes the
-- audit log + stamps paid_at/paid_by automatically when transitioning
-- to 'paid'. Other transitions (owed ↔ waived) clear the paid stamp.
create or replace function public.admin_set_commission_status(
  p_booking_id uuid,
  p_status commission_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_db_id uuid;
  trimmed_note text;
  current_amount numeric(10,2);
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  select id into current_user_db_id
  from public.users where auth_user_id = auth.uid();

  trimmed_note := nullif(trim(p_note), '');

  if p_status = 'paid'::commission_status then
    update public.bookings set
      commission_status = p_status,
      commission_paid_at = now(),
      commission_paid_by = current_user_db_id,
      commission_payment_note = trimmed_note,
      updated_at = now()
    where id = p_booking_id
    returning commission_amount into current_amount;
  else
    update public.bookings set
      commission_status = p_status,
      commission_paid_at = null,
      commission_paid_by = null,
      commission_payment_note = trimmed_note,
      updated_at = now()
    where id = p_booking_id
    returning commission_amount into current_amount;
  end if;

  insert into public.audit_log (actor_user_id, action, target_table, target_id, payload)
  values (
    current_user_db_id,
    'commission_payment',
    'bookings',
    p_booking_id::text,
    jsonb_build_object(
      'booking_id', p_booking_id,
      'status', p_status::text,
      'amount', current_amount,
      'note', trimmed_note
    )
  );
end $$;

revoke all on function public.admin_set_commission_status(uuid, commission_status, text) from public;
grant execute on function public.admin_set_commission_status(uuid, commission_status, text) to authenticated;


-- 6.2 provider_financial_summary — returns aggregates for one provider.
-- RLS still applies on the underlying bookings table (admin or owning
-- provider can read).
create or replace function public.provider_financial_summary(
  p_provider_id uuid
)
returns table (
  total_completed bigint,
  total_revenue numeric,
  total_commission_owed numeric,
  total_commission_paid numeric,
  total_commission_waived numeric,
  balance numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where b.status = 'completed'::booking_status)::bigint as total_completed,
    coalesce(sum(b.price) filter (where b.status = 'completed'::booking_status), 0)::numeric as total_revenue,
    coalesce(sum(b.commission_amount) filter (where b.commission_status = 'owed'::commission_status), 0)::numeric as total_commission_owed,
    coalesce(sum(b.commission_amount) filter (where b.commission_status = 'paid'::commission_status), 0)::numeric as total_commission_paid,
    coalesce(sum(b.commission_amount) filter (where b.commission_status = 'waived'::commission_status), 0)::numeric as total_commission_waived,
    coalesce(sum(b.commission_amount) filter (where b.commission_status = 'owed'::commission_status), 0)::numeric as balance
  from public.bookings b
  where b.provider_id = p_provider_id;
$$;

revoke all on function public.provider_financial_summary(uuid) from public;
grant execute on function public.provider_financial_summary(uuid) to authenticated;


-- ============================================================
-- ✅ Done. اختبر:
--   • Mark a pending booking as completed via the provider UI; check
--     bookings.commission_status='owed' and commission_amount > 0.
--   • Cancel a completed booking; commission_status flips to 'waived'.
--   • Call admin_set_commission_status(booking_id, 'paid', 'wire 12-04')
--     as an admin; verify commission_paid_at/by + audit_log row written.
--   • Call provider_financial_summary(provider_id); confirm aggregates.
-- ============================================================
