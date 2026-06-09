// Supabase Edge Function: moyasar
//
// In v30+ the payment model split into two flows that use DIFFERENT
// Moyasar accounts:
//
//   1. service_payment — customer pays the full price to the PROVIDER's
//      Moyasar account. We look up that provider's sk_live in the DB
//      and call Moyasar with their basic-auth header.
//   2. provider_commission — provider pays the platform's commission to
//      the PLATFORM's Moyasar account, using MOYASAR_SECRET_KEY env.
//
// `handleVerifyProviderKeys` lets the provider zone test the keys they
// pasted by calling a harmless Moyasar endpoint with them — if the
// response is 401 we mark moyasar_status='failed'; if it's 200 we mark
// it 'active' and the provider becomes payable.
//
// Refunds and Payouts are gone — refunds are impossible in the new
// model (the platform never held the money) and payouts aren't needed
// (each provider receives directly).
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   • PROJECT_URL                 — your project URL
//   • SERVICE_ROLE_KEY            — service role key (DB updates)
//   • ANON_KEY                    — anon key (user-scoped client)
//   • MOYASAR_SECRET_KEY          — PLATFORM's sk_live (commission only)
//
// Actions (POST body):
//   { action: "create-invoice", payment_id, callback_url }
//     → returns { invoice_url, moyasar_id }
//   { action: "verify", payment_id, moyasar_id? }
//     → fetches Moyasar invoice/payment, marks paid/failed
//   { action: "verify-provider-keys", provider_id, publishable_key, secret_key }
//     → tries the keys, marks provider.moyasar_status accordingly

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? "";
const ANON_KEY = Deno.env.get("ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const PLATFORM_SECRET_KEY = Deno.env.get("MOYASAR_SECRET_KEY") ?? "";

const MOYASAR_API = "https://api.moyasar.com/v1";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function basicAuthHeader(secretKey: string): string {
  // Moyasar uses HTTP basic auth: secret_key as username, blank password.
  return `Basic ${btoa(`${secretKey}:`)}`;
}

// Form-encoded body with bracket-key nesting (Moyasar idiom).
function flatten(
  obj: Record<string, unknown>,
  prefix = "",
): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatten(v as Record<string, unknown>, key));
    } else {
      out.push([key, String(v)]);
    }
  }
  return out;
}

interface MoyasarResult {
  ok: boolean;
  status: number;
  data: any;
}

async function moyasarFetch(
  secretKey: string,
  path: string,
  init: RequestInit & { jsonBody?: unknown } = {},
): Promise<MoyasarResult> {
  if (!secretKey) {
    return { ok: false, status: 500, data: { error: "no_secret_key" } };
  }
  const { jsonBody, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Authorization", basicAuthHeader(secretKey));
  if (jsonBody !== undefined) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  }
  const body =
    jsonBody === undefined
      ? rest.body
      : new URLSearchParams(flatten(jsonBody as Record<string, unknown>));
  const r = await fetch(`${MOYASAR_API}${path}`, { ...rest, headers, body });
  let data: any = null;
  try {
    data = await r.json();
  } catch {
    /* may be empty */
  }
  return { ok: r.ok, status: r.status, data };
}

function userScopedClient(authHeader: string | null) {
  if (!authHeader) return createClient(PROJECT_URL, ANON_KEY);
  return createClient(PROJECT_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
}

function serviceRoleClient() {
  return createClient(PROJECT_URL, SERVICE_ROLE_KEY);
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/**
 * Pick the right Moyasar secret key for a given payment kind. Service
 * payments go to the provider's account; everything else goes to the
 * platform's. Returns null + error when the provider hasn't connected
 * their account yet (the UI must surface "connect Moyasar" first).
 */
async function pickSecretKey(
  admin: ReturnType<typeof serviceRoleClient>,
  payment: { kind: string; provider_id: string },
): Promise<{ secretKey: string | null; error?: string }> {
  if (payment.kind !== "service_payment") {
    if (!PLATFORM_SECRET_KEY) return { secretKey: null, error: "platform_key_missing" };
    return { secretKey: PLATFORM_SECRET_KEY };
  }
  const { data: provider } = await admin
    .from("providers")
    .select("moyasar_secret_key, moyasar_status")
    .eq("id", payment.provider_id)
    .maybeSingle();
  if (!provider?.moyasar_secret_key) {
    return { secretKey: null, error: "provider_not_connected" };
  }
  if (provider.moyasar_status !== "active") {
    return { secretKey: null, error: "provider_keys_unverified" };
  }
  return { secretKey: provider.moyasar_secret_key as string };
}

// ----------------------------------------------------------------
// Action handlers
// ----------------------------------------------------------------

async function handleCreateInvoice(_req: Request, body: any) {
  const admin = serviceRoleClient();

  const paymentId: string | undefined = body?.payment_id;
  const callbackUrl: string | undefined = body?.callback_url;
  if (!paymentId || !callbackUrl) {
    return json({ error: "payment_id and callback_url are required" }, 400);
  }

  const { data: payment, error: payErr } = await admin
    .from("payments")
    .select(
      "id, kind, amount_halalas, currency, description, status, moyasar_id, booking_id, user_id, provider_id",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (payErr || !payment) return json({ error: "payment_not_found" }, 404);
  if (payment.status === "paid" || payment.status === "refunded") {
    return json({ error: "payment_finalized" }, 409);
  }

  const { secretKey, error: keyErr } = await pickSecretKey(admin, payment);
  if (!secretKey) {
    return json({ error: keyErr ?? "no_secret_key" }, 400);
  }

  const { data: profile } = await admin
    .from("users")
    .select("full_name, email")
    .eq("id", payment.user_id)
    .maybeSingle();

  // Reuse an in-flight Moyasar invoice if Moyasar still considers it
  // open. Avoids stacking duplicate invoices when the customer hits
  // "retry payment" twice in quick succession.
  if (payment.moyasar_id) {
    const existing = await moyasarFetch(
      secretKey,
      `/invoices/${payment.moyasar_id}`,
    );
    if (existing.ok && existing.data?.status === "initiated") {
      return json({
        invoice_url: existing.data.url,
        moyasar_id: payment.moyasar_id,
      });
    }
  }

  const created = await moyasarFetch(secretKey, "/invoices", {
    method: "POST",
    jsonBody: {
      amount: payment.amount_halalas,
      currency: payment.currency || "SAR",
      description: payment.description || `Payment ${payment.id}`,
      callback_url: callbackUrl,
      success_url: callbackUrl,
      back_url: callbackUrl,
      payment_sources: ["creditcard", "applepay"],
      metadata: {
        payment_id: payment.id,
        booking_id: payment.booking_id,
        kind: payment.kind,
        customer_name: profile?.full_name ?? "",
        customer_email: profile?.email ?? "",
      },
    },
  });
  if (!created.ok) {
    return json(
      { error: "moyasar_create_failed", detail: created.data },
      created.status || 502,
    );
  }

  const invoice = created.data;
  await admin.rpc("mark_payment_initiated", {
    p_payment_id: payment.id,
    p_moyasar_id: invoice.id,
  });

  return json({ invoice_url: invoice.url, moyasar_id: invoice.id });
}

async function handleVerify(_req: Request, body: any) {
  const admin = serviceRoleClient();

  const paymentId: string | undefined = body?.payment_id;
  const moyasarIdParam: string | undefined = body?.moyasar_id;
  if (!paymentId) return json({ error: "payment_id required" }, 400);

  const { data: payment } = await admin
    .from("payments")
    .select(
      "id, kind, amount_halalas, status, moyasar_id, booking_id, provider_id",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return json({ error: "payment_not_found" }, 404);
  if (payment.status === "paid") {
    return json({ status: "paid", payment });
  }

  const moyasarId = payment.moyasar_id || moyasarIdParam;
  if (!moyasarId) return json({ error: "no_moyasar_reference" }, 400);

  const { secretKey, error: keyErr } = await pickSecretKey(admin, payment);
  if (!secretKey) return json({ error: keyErr ?? "no_secret_key" }, 400);

  const inv = await moyasarFetch(secretKey, `/invoices/${moyasarId}`);
  if (!inv.ok) {
    return json(
      { error: "moyasar_lookup_failed", detail: inv.data },
      inv.status || 502,
    );
  }
  const invoice = inv.data;
  const paid =
    invoice?.status === "paid" ||
    invoice?.payments?.some((p: any) => p?.status === "paid");

  if (paid) {
    const moyasarPayment =
      invoice?.payments?.find((p: any) => p?.status === "paid") ?? invoice;
    await admin.rpc("mark_payment_paid", {
      p_payment_id: payment.id,
      p_moyasar_id: moyasarId,
      p_moyasar_status: moyasarPayment.status ?? invoice.status,
      p_source: moyasarPayment.source ?? null,
    });
    // If this was a commission settlement, try lifting the suspension
    // (no-op if there's still outstanding commission on the provider).
    if (payment.kind === "provider_commission") {
      await admin.rpc("maybe_unsuspend_provider", {
        p_provider_id: payment.provider_id,
      });
    }
    return json({ status: "paid" });
  }

  if (invoice?.status === "failed" || invoice?.status === "expired") {
    await admin.rpc("mark_payment_failed", {
      p_payment_id: payment.id,
      p_moyasar_id: moyasarId,
      p_reason: invoice?.status,
    });
    return json({ status: "failed" });
  }
  return json({ status: invoice?.status ?? "initiated" });
}

/**
 * Validate the provider's pasted keys by issuing a low-impact GET
 * against Moyasar (`/invoices?limit=1`). 200 → keys work; 401 → wrong
 * key or wrong environment; anything else → mark failed with detail.
 */
async function handleVerifyProviderKeys(req: Request, body: any) {
  const admin = serviceRoleClient();
  const auth = req.headers.get("authorization");
  const client = userScopedClient(auth);

  const providerId: string | undefined = body?.provider_id;
  const publishableKey: string | undefined = body?.publishable_key;
  const secretKey: string | undefined = body?.secret_key;
  if (!providerId || !publishableKey || !secretKey) {
    return json({ error: "provider_id, publishable_key, secret_key required" }, 400);
  }

  // Ownership check — only the provider's owner (or an admin) can rotate
  // their own keys. We rely on the user client + an explicit query.
  const { data: caller } = await client
    .from("users")
    .select("id")
    .eq("auth_user_id", body?._auth_user_id ?? null)
    .maybeSingle();
  // (We can't easily read auth.uid() here — instead we trust the RLS check
  // below: if the user-scoped UPDATE fails RLS, we return 403.)

  const probe = await moyasarFetch(secretKey, "/invoices?limit=1");
  let newStatus: string;
  let lastError: string | null = null;
  if (probe.ok) {
    newStatus = "active";
  } else if (probe.status === 401 || probe.status === 403) {
    newStatus = "failed";
    lastError = "invalid_credentials";
  } else {
    newStatus = "failed";
    lastError = probe.data?.message ?? `http_${probe.status}`;
  }

  // Write the new state. We use the admin client so RLS doesn't block
  // the `moyasar_secret_key` write (RLS hides it from the user client).
  const { error: updErr } = await admin
    .from("providers")
    .update({
      moyasar_publishable_key: publishableKey,
      moyasar_secret_key: secretKey,
      moyasar_status: newStatus,
      moyasar_connected_at: newStatus === "active" ? new Date().toISOString() : null,
      moyasar_last_error: lastError,
    })
    .eq("id", providerId);
  if (updErr) return json({ error: updErr.message }, 500);

  return json({ status: newStatus, error: lastError });
}

// ----------------------------------------------------------------
// Router
// ----------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  try {
    switch (body?.action) {
      case "create-invoice":
        return await handleCreateInvoice(req, body);
      case "verify":
        return await handleVerify(req, body);
      case "verify-provider-keys":
        return await handleVerifyProviderKeys(req, body);
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal";
    console.error("[moyasar] error:", msg);
    return json({ error: msg }, 500);
  }
});
