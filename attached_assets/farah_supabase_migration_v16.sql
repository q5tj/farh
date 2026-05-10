-- ============================================================
-- migration_v16: Multi-method final-payment workflow
--
-- New rules (per the owner's spec):
--   1. When the customer pays the deposit, the provider's share of the
--      deposit is marked as released to the provider's wallet immediately
--      (provider_net_halalas = deposit - app_share already exists in v15
--       as a snapshot — we just expose it as a wallet balance).
--   2. When the provider marks a booking "completed", they pick how the
--      remaining amount (price − deposit) is settled with the customer:
--        • online        — customer pays via Moyasar; we deduct any
--                          remaining commission and credit the rest
--                          to the provider's wallet
--        • cash          — customer paid the provider directly in cash
--        • bank_transfer — customer paid via bank transfer
--      In cash/bank_transfer the provider still owes us the remaining
--      commission, so a `provider_commission` payment row is created
--      automatically and a soft "settle commission" warning surfaces.
--   3. New payment kind: `final_payment` — the customer's online payment
--      of the remaining amount.
--
-- Adds:
--   §1  bookings columns: final_payment_method, final_payment_status,
--        final_payment_at
--   §2  payments enum value: final_payment
--   §3  RPCs:
--        • record_completion(p_booking_id, p_method, p_note)  — provider
--        • create_final_payment_pending(p_booking_id)         — customer
--        • provider_wallet_breakdown(p_provider_id)           — read
--   §4  mark_payment_paid: handle final_payment kind so the customer's
--        online final payment closes the booking + commission in one go.
-- ============================================================

begin;

-- ============================================================
-- §1  bookings — final-payment columns
-- ============================================================
do $$ begin
  create type public.final_payment_method as enum (
    'online',         -- paid via Moyasar inside the app
    'cash',           -- paid to the provider in cash
    'bank_transfer'   -- paid to the provider via bank transfer
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.final_payment_state as enum (
    'not_required',   -- deposit covered the whole price (rare)
    'pending',        -- waiting on the customer (online flow)
    'paid'            -- settled (online success, or cash/transfer recorded)
  );
exception when duplicate_object then null; end $$;

alter table public.bookings
  add column if not exists final_payment_method public.final_payment_method,
  add column if not exists final_payment_status public.final_payment_state
    not null default 'not_required',
  add column if not exists final_payment_at timestamptz;

create index if not exists idx_bookings_final_payment_status
  on public.bookings(final_payment_status)
  where final_payment_status in ('pending');

-- ============================================================
-- §2  payments — new kind value (DDL must run outside a tx block in
--      pg, but ALTER TYPE … ADD VALUE in the same tx works on PG ≥ 12
--      as long as the value isn't used in the same statement.)
-- ============================================================
do $$ begin
  alter type public.payment_kind add value if not exists 'final_payment';
exception when others then null; end $$;

commit;

-- A second tx so the new enum value is visible to the DDL below.
begin;

-- ============================================================
-- §3  RPC: provider records completion + chosen settlement method
-- ============================================================
create or replace function public.record_completion(
  p_booking_id uuid,
  p_method public.final_payment_method,
  p_note text default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_db_id uuid;
  v_provider record;
  v_booking record;
  v_remaining numeric;
  v_remaining_halalas integer;
  v_owed_commission numeric;
  v_owed_halalas integer;
  v_payment_id uuid;
  v_already_paid_commission numeric;
  v_app_share_halalas integer;
begin
  -- AuthZ: must be the owner provider of the booking.
  select id into v_user_db_id from public.users where auth_user_id = auth.uid();
  if v_user_db_id is null then raise exception 'unauthenticated'; end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found'; end if;
  if v_booking.deposit_paid_at is null then
    raise exception 'deposit_not_paid';
  end if;

  select * into v_provider from public.providers where id = v_booking.provider_id;
  if not found or v_provider.user_id <> v_user_db_id then
    raise exception 'forbidden';
  end if;

  if v_booking.status not in ('accepted') then
    raise exception 'booking_not_in_progress';
  end if;

  -- Customer's remaining cash to settle
  v_remaining := greatest(0, v_booking.price - coalesce(v_booking.deposit_amount, 0));
  v_remaining_halalas := round(v_remaining * 100)::int;

  -- Commission still owed by provider (already net of the app_share deducted
  -- from the deposit — see compute_provider_owed_commission).
  v_owed_commission := public.compute_provider_owed_commission(p_booking_id);
  v_owed_halalas := round(v_owed_commission * 100)::int;

  if p_method = 'online' then
    -- Customer will pay via Moyasar. Mark booking completed-pending-payment
    -- and let the customer trigger create_final_payment_pending → invoice.
    update public.bookings
      set status = 'completed',
          final_payment_method = 'online',
          final_payment_status = case
            when v_remaining <= 0 then 'paid'::public.final_payment_state
            else 'pending'::public.final_payment_state
          end,
          final_payment_at = case
            when v_remaining <= 0 then now() else null
          end
      where id = p_booking_id;

    insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
    values (
      'booking.completed_online_pending', 'bookings', p_booking_id::text,
      v_user_db_id,
      jsonb_build_object(
        'remaining_halalas', v_remaining_halalas,
        'commission_due_halalas', v_owed_halalas,
        'note', p_note
      )
    );

    return jsonb_build_object(
      'method', 'online',
      'remaining', v_remaining,
      'commission_due', v_owed_commission,
      'final_payment_status',
        case when v_remaining <= 0 then 'paid' else 'pending' end
    );
  end if;

  -- Cash / bank_transfer flow: provider says "I received the money",
  -- the booking is closed but commission is owed by the provider.
  update public.bookings
    set status = 'completed',
        final_payment_method = p_method,
        final_payment_status = 'paid'::public.final_payment_state,
        final_payment_at = now()
    where id = p_booking_id;

  -- Create a pending provider_commission row for the remaining commission
  -- (skip if zero — e.g. if app_share already covered the full commission).
  if v_owed_halalas > 0 then
    insert into public.payments (
      booking_id, user_id, provider_id, kind,
      amount_halalas, description, status
    ) values (
      p_booking_id, v_user_db_id, v_booking.provider_id, 'provider_commission',
      v_owed_halalas,
      'Commission settlement (' || p_method::text || ') for booking ' || p_booking_id::text,
      'pending'
    )
    returning id into v_payment_id;
  end if;

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values (
    'booking.completed_offline', 'bookings', p_booking_id::text, v_user_db_id,
    jsonb_build_object(
      'method', p_method,
      'remaining_halalas', v_remaining_halalas,
      'commission_due_halalas', v_owed_halalas,
      'note', p_note,
      'commission_payment_id', v_payment_id
    )
  );

  return jsonb_build_object(
    'method', p_method,
    'remaining', v_remaining,
    'commission_due', v_owed_commission,
    'commission_payment_id', v_payment_id,
    'final_payment_status', 'paid'
  );
end $$;

grant execute on function public.record_completion(uuid, public.final_payment_method, text)
  to authenticated;

-- ============================================================
-- §3.b RPC: customer creates the pending final-payment row
-- ============================================================
create or replace function public.create_final_payment_pending(
  p_booking_id uuid
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_db_id uuid;
  v_booking record;
  v_remaining numeric;
  v_remaining_halalas integer;
  v_owed_commission numeric;
  v_owed_halalas integer;
  v_provider_net_halalas integer;
  v_payment_id uuid;
begin
  select id into v_user_db_id from public.users where auth_user_id = auth.uid();
  if v_user_db_id is null then raise exception 'unauthenticated'; end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found'; end if;
  if v_booking.user_id <> v_user_db_id then raise exception 'forbidden'; end if;
  if v_booking.final_payment_method <> 'online' then
    raise exception 'final_payment_method_not_online';
  end if;
  if v_booking.final_payment_status = 'paid' then
    raise exception 'already_paid';
  end if;

  v_remaining := greatest(0, v_booking.price - coalesce(v_booking.deposit_amount, 0));
  v_remaining_halalas := round(v_remaining * 100)::int;
  if v_remaining_halalas <= 0 then raise exception 'no_remaining_amount'; end if;

  v_owed_commission := public.compute_provider_owed_commission(p_booking_id);
  v_owed_halalas := round(v_owed_commission * 100)::int;
  v_provider_net_halalas := greatest(0, v_remaining_halalas - v_owed_halalas);

  insert into public.payments (
    booking_id, user_id, provider_id, kind,
    amount_halalas, app_share_halalas, provider_net_halalas,
    description, status
  ) values (
    p_booking_id, v_user_db_id, v_booking.provider_id, 'final_payment',
    v_remaining_halalas, v_owed_halalas, v_provider_net_halalas,
    'Remaining payment for booking ' || p_booking_id::text, 'pending'
  )
  returning id into v_payment_id;

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values ('payment.final_pending', 'payments', v_payment_id::text, v_user_db_id,
    jsonb_build_object(
      'booking_id', p_booking_id,
      'amount_halalas', v_remaining_halalas,
      'commission_halalas', v_owed_halalas,
      'provider_net_halalas', v_provider_net_halalas
    ));

  return v_payment_id;
end $$;

grant execute on function public.create_final_payment_pending(uuid) to authenticated;

-- ============================================================
-- §4  mark_payment_paid: handle final_payment kind
-- ============================================================
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

  if not found then return; end if; -- idempotent

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

  elsif v_payment.kind = 'final_payment' then
    -- Online final settlement: close the booking, mark commission paid.
    update public.bookings
      set final_payment_status = 'paid'::public.final_payment_state,
          final_payment_at = now(),
          commission_paid_at = now(),
          commission_status = 'paid'::commission_status,
          commission_due_from_provider = 0
    where id = v_payment.booking_id;
  end if;

  insert into public.audit_log (action, target_table, target_id, actor_user_id, payload)
  values ('payment.paid', 'payments', p_payment_id::text, null,
    jsonb_build_object('moyasar_id', p_moyasar_id, 'kind', v_payment.kind));
end $$;

-- ============================================================
-- §5  RPC: provider wallet breakdown (read-only)
--
-- The wallet model:
--   • The provider's "released" balance grows whenever a
--     booking_deposit OR final_payment of theirs is paid — by
--     provider_net_halalas. (That column was already filled by v15 for
--     deposits and is filled by §3.b above for final_payment.)
--   • Whenever the platform makes a payout to the provider, we record
--     a row in `provider_payouts` (created lazily below if missing) and
--     subtract it. For now there's no payout UI, so balance == sum.
-- ============================================================
create table if not exists public.provider_payouts (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  amount_halalas integer not null check (amount_halalas > 0),
  method text,
  reference text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);
create index if not exists idx_provider_payouts_provider
  on public.provider_payouts(provider_id);

alter table public.provider_payouts enable row level security;

drop policy if exists "provider_payouts_self_read" on public.provider_payouts;
create policy "provider_payouts_self_read" on public.provider_payouts
  for select using (
    exists (
      select 1 from public.providers p
      join public.users u on u.id = p.user_id
      where p.id = provider_payouts.provider_id and u.auth_user_id = auth.uid()
    )
  );

drop policy if exists "provider_payouts_admin_all" on public.provider_payouts;
create policy "provider_payouts_admin_all" on public.provider_payouts
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.provider_wallet_breakdown(
  p_provider_id uuid
) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_released_halalas bigint;
  v_paid_out_halalas bigint;
  v_pending_commission_halalas bigint;
begin
  select coalesce(sum(provider_net_halalas), 0)
    into v_released_halalas
    from public.payments
    where provider_id = p_provider_id
      and kind in ('booking_deposit', 'final_payment')
      and status = 'paid';

  select coalesce(sum(amount_halalas), 0)
    into v_paid_out_halalas
    from public.provider_payouts
    where provider_id = p_provider_id;

  select coalesce(sum(amount_halalas), 0)
    into v_pending_commission_halalas
    from public.payments
    where provider_id = p_provider_id
      and kind = 'provider_commission'
      and status in ('pending', 'initiated');

  return jsonb_build_object(
    'released_sar', round(v_released_halalas / 100.0, 2),
    'paid_out_sar', round(v_paid_out_halalas / 100.0, 2),
    'available_sar', round((v_released_halalas - v_paid_out_halalas) / 100.0, 2),
    'pending_commission_sar', round(v_pending_commission_halalas / 100.0, 2)
  );
end $$;

grant execute on function public.provider_wallet_breakdown(uuid) to authenticated;

commit;
