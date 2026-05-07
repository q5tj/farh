-- ============================================================
-- migration_v15: Moyasar payment integration
--
-- Adds:
--   §1  app_settings: deposit_percentage, app_share_from_deposit,
--        cancellation_window_full, cancellation_window_half
--   §2  payments table — every Moyasar transaction (deposit + commission)
--   §3  bookings: deposit_amount, deposit_paid_at, commission_due_*,
--        commission_paid_at, refund_*
--   §4  RPCs: create_booking_deposit_pending, mark_payment_paid,
--        mark_payment_failed, mark_payment_refunded, provider_owed_commission,
--        compute_refund_amount
--   §5  RLS: customers see their own payments, providers see commission
--        payments owed by them, admin sees all
--   §6  Audit_log on all status transitions
-- ============================================================

begin;

-- ============================================================
-- §1  app_settings — payment percentages
-- ============================================================
insert into public.app_settings (key, value) values
  ('deposit_percentage', '25'::jsonb),
  ('app_share_from_deposit', '10'::jsonb),
  ('cancellation_window_full_days', '10'::jsonb),
  ('cancellation_window_half_days', '5'::jsonb)
on conflict (key) do nothing;

-- ============================================================
-- §2  payments table
-- ============================================================
do $$ begin
  create type public.payment_kind as enum (
    'booking_deposit',  -- customer paying the booking deposit
    'provider_commission' -- provider paying back the remaining commission
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_record_status as enum (
    'pending',     -- created locally, not yet handed to Moyasar
    'initiated',   -- Moyasar has issued a payment id; awaiting customer auth
    'paid',        -- Moyasar reports paid
    'failed',      -- Moyasar reports failed/declined/expired
    'refunded',    -- successfully refunded (full or partial)
    'voided'       -- cancelled before any capture
  );
exception when duplicate_object then null; end $$;

create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  -- linkage
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete set null,
  kind public.payment_kind not null,
  -- amounts (stored in halalas — SAR × 100 — to match Moyasar)
  amount_halalas integer not null check (amount_halalas > 0),
  currency text not null default 'SAR',
  -- our share (only meaningful for booking_deposit)
  app_share_halalas integer not null default 0,
  provider_net_halalas integer not null default 0,
  -- moyasar linkage
  moyasar_id text unique,
  moyasar_status text,
  moyasar_source jsonb, -- { type, brand, last_4, ... }
  description text,
  -- refund tracking
  refunded_amount_halalas integer not null default 0,
  refund_reason text,
  -- lifecycle
  status public.payment_record_status not null default 'pending',
  initiated_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  fail_reason text,
  -- meta
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_booking on public.payments(booking_id);
create index if not exists idx_payments_user on public.payments(user_id);
create index if not exists idx_payments_provider on public.payments(provider_id);
create index if not exists idx_payments_kind_status on public.payments(kind, status);
create index if not exists idx_payments_moyasar on public.payments(moyasar_id);

drop trigger if exists trg_payments_touch on public.payments;
create trigger trg_payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ============================================================
-- §3  bookings — payment columns
-- ============================================================
alter table public.bookings
  add column if not exists deposit_amount numeric(12,2),
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists commission_due_from_provider numeric(12,2),
  add column if not exists commission_paid_at timestamptz,
  add column if not exists refund_status text check (
    refund_status is null
    or refund_status in ('none', 'requested', 'partial', 'full')
  ),
  add column if not exists refund_amount numeric(12,2);

-- ============================================================
-- §4  RPCs
-- ============================================================

-- Compute the deposit amount for a service price using current app settings.
create or replace function public.compute_deposit_amount(p_service_price numeric)
returns numeric language sql stable as $$
  select round(
    (p_service_price * coalesce(
      (select (value::text)::numeric from public.app_settings where key = 'deposit_percentage'),
      25
    ) / 100.0)::numeric
  , 2);
$$;

-- Compute the app's fixed share that should be retained from the deposit
-- (the rest is "owed to the provider" but stays in our hands until the booking
-- completes — we expose the breakdown for accounting.)
create or replace function public.compute_app_share(p_deposit_amount numeric)
returns numeric language sql stable as $$
  select round(
    (p_deposit_amount * coalesce(
      (select (value::text)::numeric from public.app_settings where key = 'app_share_from_deposit'),
      10
    ) / 100.0)::numeric
  , 2);
$$;

-- Compute remaining commission the provider owes the platform.
-- formula: (service_price × commission_rate%) − app_share_from_deposit_amount
create or replace function public.compute_provider_owed_commission(p_booking_id uuid)
returns numeric language plpgsql stable as $$
declare
  v_price numeric;
  v_commission_rate numeric;
  v_deposit numeric;
  v_app_share numeric;
begin
  select b.price into v_price
    from public.bookings b where b.id = p_booking_id;
  if v_price is null then return 0; end if;

  select (value::text)::numeric into v_commission_rate
    from public.app_settings where key = 'commission_rate';
  v_commission_rate := coalesce(v_commission_rate, 10);

  v_deposit := public.compute_deposit_amount(v_price);
  v_app_share := public.compute_app_share(v_deposit);

  return greatest(0, round(v_price * v_commission_rate / 100.0 - v_app_share, 2));
end $$;

-- Refund eligibility based on days until booking start.
-- Returns the refundable deposit amount (after deducting app fee).
create or replace function public.compute_refund_amount(p_booking_id uuid)
returns numeric language plpgsql stable as $$
declare
  v_booking record;
  v_days_to_start integer;
  v_full_window integer;
  v_half_window integer;
  v_deposit numeric;
  v_app_share numeric;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found or v_booking.deposit_amount is null then return 0; end if;

  v_days_to_start := extract(day from (v_booking.start_at - now()))::int;

  select (value::text)::numeric into v_full_window
    from public.app_settings where key = 'cancellation_window_full_days';
  select (value::text)::numeric into v_half_window
    from public.app_settings where key = 'cancellation_window_half_days';
  v_full_window := coalesce(v_full_window, 10);
  v_half_window := coalesce(v_half_window, 5);

  v_deposit := v_booking.deposit_amount;
  v_app_share := public.compute_app_share(v_deposit);

  if v_days_to_start >= v_full_window then
    return greatest(0, v_deposit - v_app_share);
  elsif v_days_to_start >= v_half_window then
    return greatest(0, (v_deposit / 2.0) - v_app_share);
  else
    return 0;
  end if;
end $$;

-- Create a pending booking_deposit payment row (called by edge function
-- before it talks to Moyasar). RLS lets the authenticated user create
-- payments only for their own bookings.
create or replace function public.create_booking_deposit_pending(
  p_booking_id uuid
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_db_id uuid;
  v_booking record;
  v_deposit numeric;
  v_deposit_halalas integer;
  v_app_share numeric;
  v_app_share_halalas integer;
  v_provider_net_halalas integer;
  v_payment_id uuid;
begin
  select id into v_user_db_id from public.users where auth_user_id = auth.uid();
  if v_user_db_id is null then
    raise exception 'unauthenticated';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found'; end if;
  if v_booking.user_id <> v_user_db_id then raise exception 'forbidden'; end if;
  if v_booking.deposit_paid_at is not null then
    raise exception 'deposit_already_paid';
  end if;

  v_deposit := public.compute_deposit_amount(v_booking.price);
  v_app_share := public.compute_app_share(v_deposit);
  v_deposit_halalas := round(v_deposit * 100)::int;
  v_app_share_halalas := round(v_app_share * 100)::int;
  v_provider_net_halalas := v_deposit_halalas - v_app_share_halalas;

  -- snapshot the deposit on the booking so future refund math is stable
  update public.bookings
    set deposit_amount = v_deposit,
        commission_due_from_provider = public.compute_provider_owed_commission(p_booking_id)
  where id = p_booking_id;

  insert into public.payments (
    booking_id, user_id, provider_id, kind,
    amount_halalas, app_share_halalas, provider_net_halalas,
    description, status
  ) values (
    p_booking_id, v_user_db_id, v_booking.provider_id, 'booking_deposit',
    v_deposit_halalas, v_app_share_halalas, v_provider_net_halalas,
    'Deposit for booking ' || p_booking_id::text, 'pending'
  )
  returning id into v_payment_id;

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values ('payment.deposit_pending', 'payments', v_payment_id::text, v_user_db_id,
    jsonb_build_object('booking_id', p_booking_id, 'amount_halalas', v_deposit_halalas));

  return v_payment_id;
end $$;

-- Provider-side: create pending commission payment.
create or replace function public.create_commission_payment_pending(
  p_booking_id uuid
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_db_id uuid;
  v_booking record;
  v_provider record;
  v_owed numeric;
  v_owed_halalas integer;
  v_payment_id uuid;
begin
  select id into v_user_db_id from public.users where auth_user_id = auth.uid();
  if v_user_db_id is null then raise exception 'unauthenticated'; end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found'; end if;
  if v_booking.commission_paid_at is not null then
    raise exception 'commission_already_paid';
  end if;

  select * into v_provider from public.providers where id = v_booking.provider_id;
  if not found or v_provider.user_id <> v_user_db_id then
    raise exception 'forbidden';
  end if;

  v_owed := public.compute_provider_owed_commission(p_booking_id);
  if v_owed <= 0 then raise exception 'nothing_owed'; end if;

  v_owed_halalas := round(v_owed * 100)::int;

  insert into public.payments (
    booking_id, user_id, provider_id, kind,
    amount_halalas, description, status
  ) values (
    p_booking_id, v_user_db_id, v_booking.provider_id, 'provider_commission',
    v_owed_halalas, 'Commission settlement for booking ' || p_booking_id::text,
    'pending'
  )
  returning id into v_payment_id;

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values ('payment.commission_pending', 'payments', v_payment_id::text, v_user_db_id,
    jsonb_build_object('booking_id', p_booking_id, 'amount_halalas', v_owed_halalas));

  return v_payment_id;
end $$;

-- Edge function (service role) marks a payment paid after Moyasar webhook.
create or replace function public.mark_payment_paid(
  p_payment_id uuid,
  p_moyasar_id text,
  p_moyasar_status text,
  p_source jsonb
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_payment record;
begin
  update public.payments
    set status = 'paid',
        moyasar_id = coalesce(p_moyasar_id, moyasar_id),
        moyasar_status = p_moyasar_status,
        moyasar_source = p_source,
        paid_at = now()
  where id = p_payment_id
    and status in ('pending', 'initiated')
  returning * into v_payment;

  if not found then return; end if; -- already processed (idempotent)

  if v_payment.kind = 'booking_deposit' then
    update public.bookings
      set deposit_paid_at = now(),
          payment_status = 'paid'::payment_status
    where id = v_payment.booking_id;
  elsif v_payment.kind = 'provider_commission' then
    update public.bookings
      set commission_paid_at = now(),
          commission_status = 'paid'::commission_status,
          commission_due_from_provider = 0
    where id = v_payment.booking_id;
  end if;

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values ('payment.paid', 'payments', p_payment_id::text, null,
    jsonb_build_object('moyasar_id', p_moyasar_id, 'kind', v_payment.kind));
end $$;

create or replace function public.mark_payment_failed(
  p_payment_id uuid,
  p_moyasar_id text,
  p_reason text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.payments
    set status = 'failed',
        moyasar_id = coalesce(p_moyasar_id, moyasar_id),
        fail_reason = p_reason,
        failed_at = now()
  where id = p_payment_id
    and status in ('pending', 'initiated');

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values ('payment.failed', 'payments', p_payment_id::text, null,
    jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.mark_payment_initiated(
  p_payment_id uuid,
  p_moyasar_id text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.payments
    set status = 'initiated',
        moyasar_id = p_moyasar_id,
        initiated_at = now()
  where id = p_payment_id and status = 'pending';
end $$;

create or replace function public.mark_payment_refunded(
  p_payment_id uuid,
  p_refunded_halalas integer,
  p_reason text
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_payment record;
begin
  update public.payments
    set refunded_amount_halalas = coalesce(refunded_amount_halalas, 0) + p_refunded_halalas,
        refund_reason = coalesce(p_reason, refund_reason),
        refunded_at = now(),
        status = case
          when coalesce(refunded_amount_halalas, 0) + p_refunded_halalas >= amount_halalas
            then 'refunded'::payment_record_status
          else status
        end
  where id = p_payment_id
  returning * into v_payment;

  update public.bookings
    set refund_status = case
          when v_payment.refunded_amount_halalas >= v_payment.amount_halalas then 'full'
          else 'partial'
        end,
        refund_amount = (v_payment.refunded_amount_halalas / 100.0)::numeric
  where id = v_payment.booking_id;

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values ('payment.refunded', 'payments', p_payment_id::text, null,
    jsonb_build_object('halalas', p_refunded_halalas, 'reason', p_reason));
end $$;

-- ============================================================
-- §5  RLS
-- ============================================================
alter table public.payments enable row level security;

drop policy if exists "payments_read_own" on public.payments;
create policy "payments_read_own" on public.payments
  for select using (
    -- customer reads their own payments
    user_id in (select id from public.users where auth_user_id = auth.uid())
    -- or provider reads commission payments owed by them
    or provider_id in (
      select p.id from public.providers p
      join public.users u on u.id = p.user_id
      where u.auth_user_id = auth.uid()
    )
    -- or admin reads everything
    or public.is_admin()
  );

drop policy if exists "payments_admin_write" on public.payments;
create policy "payments_admin_write" on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- (Customers/providers do NOT directly INSERT/UPDATE — they go through
--  the RPCs above which run with security definer.)

commit;
