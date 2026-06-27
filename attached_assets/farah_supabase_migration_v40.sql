-- v40: fix PGRST203 ambiguous overload on record_completion
--
-- v16 created public.record_completion(uuid, public.final_payment_method, text).
-- v30/v35 later did `create or replace function public.record_completion(uuid, text, text)`
-- — a DIFFERENT signature, so Postgres added it as a SECOND overload instead
-- of replacing the first. Both have stuck around ever since.
--
-- supabase-js sends p_method as a plain JSON string, which matches both
-- overloads (text directly, and the enum via an implicit cast), so
-- PostgREST can't pick one and every call to record_completion fails with
-- PGRST203. This is what breaks "mark booking completed" on the provider
-- requests screen on web/Android/iOS alike (it's the same RPC everywhere).
--
-- Fix: drop the dead v16 enum-typed overload. The text-typed one (v35) is
-- the live implementation and stays untouched.

drop function if exists public.record_completion(uuid, public.final_payment_method, text);
