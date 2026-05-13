-- ============================================================
-- migration_v21:
--   §1  Add `iban` + `moyasar_seller_id` to providers (the second is
--        a placeholder for future Moyasar Connected-Account integration
--        — see notes in the app onboarding screen).
--   §2  Auto-snapshot the platform commission rate onto each booking
--        at insert time so admin rate changes apply ONLY to bookings
--        created AFTER the change. Existing bookings keep whatever
--        rate they already snapshotted.
-- ============================================================

begin;

-- ============================================================
-- §1  Providers: IBAN + moyasar_seller_id
-- ============================================================
alter table public.providers
  add column if not exists iban text,
  add column if not exists moyasar_seller_id text;

comment on column public.providers.iban is
  'Saudi IBAN of the business — used for manual settlement until we '
  'enable Moyasar Connected Accounts (enterprise tier).';

comment on column public.providers.moyasar_seller_id is
  'Reserved for future Moyasar Connected-Account ID. When set, payouts '
  'go directly to the provider''s Moyasar sub-account.';

-- ============================================================
-- §2  Snapshot platform commission rate at booking creation
-- ============================================================
-- The bookings table already has a `commission_rate` column with a
-- schema default of 10. Until now nothing was filling it explicitly,
-- so every booking used the default rather than the admin-managed
-- value in `app_settings.commission_rate`.
--
-- This trigger reads the LIVE rate from app_settings on every INSERT
-- (only when `commission_rate` wasn't passed in by the client). Once
-- set, the value never changes — so changing the admin rate only
-- affects future bookings, exactly as the owner wants.
create or replace function public.snapshot_booking_commission_rate()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_rate numeric;
begin
  if new.commission_rate is null or new.commission_rate = 10 then
    select (value::text)::numeric into v_rate
      from public.app_settings where key = 'commission_rate';
    new.commission_rate := coalesce(v_rate, 10);
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_snapshot_rate on public.bookings;
create trigger trg_bookings_snapshot_rate
  before insert on public.bookings
  for each row execute function public.snapshot_booking_commission_rate();

commit;
