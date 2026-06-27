-- v44: fix 42804 on record_completion for cash / bank_transfer
--
-- v41's cash/bank_transfer branch did:
--   final_payment_method = v_method
-- where v_method is a plpgsql `text` variable. Postgres only
-- auto-casts unknown-type STRING LITERALS to an enum column (which is
-- why the 'online' branch, using the literal 'online' directly,
-- worked) — it does NOT auto-cast a text-typed variable, even if its
-- runtime value is a valid enum label. Hence:
--   column "final_payment_method" is of type final_payment_method
--   but expression is of type text
-- Fix: cast explicitly.

create or replace function public.record_completion(
  p_booking_id uuid,
  p_method     text default 'online',
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking            record;
  v_provider_user_id   uuid;
  v_method             text := coalesce(p_method, 'online');
  v_remaining          numeric;
  v_commission_sar     numeric;
  v_commission_halalas int;
  v_commission_id      uuid;
begin
  if v_method not in ('online', 'cash', 'bank_transfer') then
    raise exception 'invalid_method';
  end if;

  select b.id, b.provider_id, b.user_id, b.price, b.status,
         b.deposit_amount, b.payment_status
  into v_booking
  from public.bookings b
  where b.id = p_booking_id;

  if v_booking is null then
    raise exception 'booking_not_found';
  end if;

  select p.user_id into v_provider_user_id
  from public.providers p
  where p.id = v_booking.provider_id;

  if v_provider_user_id is null
     or v_provider_user_id <> (select id from public.users where auth_user_id = auth.uid())
  then
    raise exception 'forbidden';
  end if;

  if v_booking.status <> 'accepted'::booking_status then
    raise exception 'booking_not_accepted';
  end if;

  if v_booking.payment_status is distinct from 'paid'::payment_status then
    raise exception 'deposit_not_paid';
  end if;

  v_remaining := v_booking.price - coalesce(v_booking.deposit_amount, 0);

  if v_method = 'online' then
    update public.bookings
      set status = 'completed'::booking_status,
          completed_at = now(),
          final_payment_method = 'online',
          final_payment_status = 'pending'
      where id = v_booking.id;

    return jsonb_build_object(
      'method',                'online',
      'remaining',             v_remaining,
      'commission_due',        0,
      'commission_payment_id', null,
      'final_payment_status',  'pending'
    );
  end if;

  -- cash / bank_transfer: provider already holds the full price, so the
  -- booking closes now and the provider owes commission on the full
  -- price (not just the deposit share).
  v_commission_sar := public.compute_full_commission(v_booking.id);
  v_commission_halalas := round(v_commission_sar * 100)::int;

  update public.bookings
    set status = 'completed'::booking_status,
        completed_at = now(),
        final_payment_method = v_method::public.final_payment_method,
        final_payment_status = 'paid'
    where id = v_booking.id;

  if v_commission_halalas > 0 then
    insert into public.payments (
      booking_id, user_id, provider_id, kind,
      amount_halalas, currency, description, status
    ) values (
      v_booking.id, v_booking.user_id, v_booking.provider_id,
      'provider_commission'::payment_kind,
      v_commission_halalas,
      'SAR',
      'Platform commission (' || v_method || ') for booking ' || v_booking.id::text,
      'pending'::payment_record_status
    )
    returning id into v_commission_id;
  end if;

  return jsonb_build_object(
    'method',                v_method,
    'remaining',              0,
    'commission_due',         v_commission_sar,
    'commission_payment_id',  v_commission_id,
    'final_payment_status',   'paid'
  );
end $$;

grant execute on function public.record_completion(uuid, text, text)
  to authenticated;
