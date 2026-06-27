-- v43: guard rail — create every type/column record_completion and
-- mark_payment_paid touch, in case it was never actually applied.
--
-- bookings.completed_at has been referenced by record_completion since
-- v30, but no migration in this folder ever ran `alter table bookings
-- add column completed_at`. The reason nobody noticed: the PGRST203
-- ambiguous-overload bug (fixed by v40) meant PostgREST could never
-- pick a record_completion overload to call, so the function's BODY
-- never actually executed in production — not since v30, not ever.
-- Today's test is the first time this code path has really run.
--
-- That means every column those two functions touch that was added
-- by a migration written PURELY to support them (v11, v15, v16) is
-- equally suspect — they may have silently failed to apply too, or
-- this gap may be the only one. This migration is 100% additive
-- (every statement is guarded with IF NOT EXISTS / duplicate_object),
-- so it's safe to run regardless of what's already there.

begin;

-- v16: settlement-method enums
do $$ begin
  create type public.final_payment_method as enum ('online', 'cash', 'bank_transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.final_payment_state as enum ('not_required', 'pending', 'paid');
exception when duplicate_object then null; end $$;

-- v11: admin commission bookkeeping enum
do $$ begin
  if not exists (select 1 from pg_type where typname = 'commission_status') then
    create type commission_status as enum ('owed', 'paid', 'waived');
  end if;
end $$;

alter table public.bookings
  -- v30/v35/v41: when the service is marked done
  add column if not exists completed_at timestamptz,
  -- v16: how the remaining amount is/was settled
  add column if not exists final_payment_method public.final_payment_method,
  add column if not exists final_payment_status public.final_payment_state
    not null default 'not_required',
  add column if not exists final_payment_at timestamptz,
  -- v15: deposit bookkeeping (almost certainly already present since the
  -- deposit flow already works in production — included defensively)
  add column if not exists deposit_amount numeric(12,2),
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists commission_due_from_provider numeric(12,2),
  -- v11/v15: admin-facing per-booking commission snapshot
  add column if not exists commission_status commission_status not null default 'owed',
  add column if not exists commission_paid_at timestamptz,
  add column if not exists commission_amount numeric(10,2);

commit;
