// Supabase Edge Function: expire-bookings
// Schedule via Supabase pg_cron OR external cron (every 15 minutes):
//   POST https://<project>.functions.supabase.co/expire-bookings
//   Header: Authorization: Bearer <CRON_SECRET>
//
// Required Function Secrets:
//   • SUPABASE_URL
//   • SUPABASE_SERVICE_ROLE_KEY
//   • CRON_SECRET   (mandatory; >= 16 chars)
//
// Deploy:
//   supabase functions deploy expire-bookings --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

if (!CRON_SECRET || CRON_SECRET.length < 16) {
  console.error("[expire-bookings] CRON_SECRET missing or weak");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!CRON_SECRET || CRON_SECRET.length < 16) {
    return new Response("Misconfigured", { status: 500 });
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { data, error } = await admin.rpc("expire_pending_bookings");
    if (error) throw error;
    return new Response(JSON.stringify({ expired: data ?? 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[expire-bookings] failed:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
