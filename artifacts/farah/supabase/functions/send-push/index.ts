// Supabase Edge Function: send-push
// Triggered by a Database Webhook on `notifications` INSERT.
// Fans the new notification out to the user's active Expo push tokens.
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
//
// Required secrets (set in Supabase Dashboard → Edge Functions → Secrets):
//   • SUPABASE_URL                — your project URL
//   • SUPABASE_SERVICE_ROLE_KEY   — service role key (RLS bypass)
//   • PUSH_WEBHOOK_SECRET         — optional shared secret matching the
//                                    Authorization header set in the webhook
//
// Webhook configuration (Supabase Dashboard → Database → Webhooks):
//   table: public.notifications
//   events: INSERT
//   type: HTTP Request
//   method: POST
//   URL: https://<your-project>.functions.supabase.co/send-push
//   headers:
//     Authorization: Bearer <PUSH_WEBHOOK_SECRET>
//   payload: leave default (full record)

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface NotificationRow {
  id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  booking_id: string | null;
  is_read?: boolean;
  created_at?: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: NotificationRow;
  old_record?: NotificationRow | null;
}

interface PushTokenRow {
  token: string;
  user_id: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET");

// Fail closed: function refuses to start if secret is unset.
if (!WEBHOOK_SECRET || WEBHOOK_SECRET.length < 16) {
  console.error(
    "[send-push] PUSH_WEBHOOK_SECRET is missing or too short. " +
      "Set it (>= 16 chars) in Function Secrets before deploying.",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function expoPushSend(messages: any[]) {
  // Expo accepts up to 100 messages per call; batch if needed.
  const chunks: any[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }
  const tickets: ExpoPushTicket[] = [];
  for (const chunk of chunks) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });
    const json = await res.json().catch(() => ({}));
    if (Array.isArray(json?.data)) {
      tickets.push(...(json.data as ExpoPushTicket[]));
    } else if (Array.isArray(json)) {
      tickets.push(...(json as ExpoPushTicket[]));
    } else {
      // Unexpected shape — log and continue.
      console.warn("[send-push] unexpected Expo response:", json);
    }
  }
  return tickets;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // MANDATORY shared-secret check — fail closed.
  if (!WEBHOOK_SECRET || WEBHOOK_SECRET.length < 16) {
    return new Response(
      "Misconfigured: PUSH_WEBHOOK_SECRET not set",
      { status: 500 },
    );
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  if (payload.type !== "INSERT" || payload.table !== "notifications") {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const notification = payload.record;
  if (!notification?.id) {
    return new Response("Missing record", { status: 400 });
  }

  // Fetch active push tokens for the recipient (or all users if broadcast).
  let q = admin
    .from("push_tokens")
    .select("token, user_id")
    .eq("is_active", true);
  if (notification.user_id) {
    q = q.eq("user_id", notification.user_id);
  }
  const { data: tokens, error: tokenErr } = await q;
  if (tokenErr) {
    console.error("[send-push] failed to fetch tokens:", tokenErr);
    return new Response(JSON.stringify({ error: tokenErr.message }), {
      status: 500,
    });
  }
  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no_tokens" }), {
      status: 200,
    });
  }

  const messages = (tokens as PushTokenRow[]).map((t) => ({
    to: t.token,
    sound: "default",
    title: notification.title,
    body: notification.body ?? "",
    data: {
      notification_id: notification.id,
      booking_id: notification.booking_id,
    },
  }));

  let tickets: ExpoPushTicket[] = [];
  try {
    tickets = await expoPushSend(messages);
  } catch (err) {
    console.error("[send-push] Expo send failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
    });
  }

  // Mark dead tokens (DeviceNotRegistered) inactive so we stop sending to them.
  const dead: string[] = [];
  tickets.forEach((ticket, i) => {
    if (
      ticket.status === "error" &&
      (ticket.details?.error === "DeviceNotRegistered" ||
        ticket.details?.error === "InvalidCredentials")
    ) {
      dead.push((tokens as PushTokenRow[])[i].token);
    }
  });
  if (dead.length > 0) {
    await admin
      .from("push_tokens")
      .update({ is_active: false })
      .in("token", dead);
  }

  return new Response(
    JSON.stringify({
      sent: messages.length,
      deactivated: dead.length,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
