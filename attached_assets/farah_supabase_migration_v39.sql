-- v39: admin notifications on new provider signup
--
-- Whenever a provider row is inserted (a new merchant just signed up
-- and submitted their store for verification), drop a notification row
-- for every user with role='admin'. The push pipeline (notifications
-- → expo_push_tokens fan-out) is already wired in earlier migrations,
-- so writing to notifications is enough to surface a banner on the
-- admin's phone.
--
-- We intentionally only fire on INSERT (the moment the application is
-- received). Status changes are already covered by
-- notify_verification_change in v8.

create or replace function public.notify_admins_new_provider()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
  city_text text;
  title_text text;
  body_text text;
begin
  display_name := coalesce(new.name_ar, new.name, '');
  city_text := coalesce(new.city, '');

  title_text := 'طلب تسجيل مزود جديد';
  body_text := case
    when display_name <> '' and city_text <> ''
      then display_name || ' (' || city_text || ') قدّم طلب اعتماد جديد'
    when display_name <> ''
      then display_name || ' قدّم طلب اعتماد جديد'
    else 'مزود جديد قدّم طلب اعتماد'
  end;

  insert into public.notifications (user_id, title, body, data)
  select
    u.id,
    title_text,
    body_text,
    jsonb_build_object(
      'kind', 'new_provider_pending',
      'provider_id', new.id
    )
  from public.users u
  where u.role = 'admin';

  return new;
end $$;

drop trigger if exists trg_notify_admins_new_provider on public.providers;
create trigger trg_notify_admins_new_provider
  after insert on public.providers
  for each row execute procedure public.notify_admins_new_provider();
