// Supabase Edge Function: moyasar
// Bridges between the app and Moyasar's invoice/refund REST API.
// All requests authenticate the caller via the Supabase JWT in the
// Authorization header so we can run RPCs as that user (avoiding RLS
// bypass for the public actions).
//
// Deploy:
//   supabase functions deploy moyasar --no-verify-jwt
//   (we verify the JWT manually below)
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   • SUPABASE_URL                — your project URL
//   • SUPABASE_SERVICE_ROLE_KEY   — service role key (used for the
//                                    privileged mark_payment_* RPCs)
//   • SUPABASE_ANON_KEY           — anon key (for the user-scoped client)
//   • MOYASAR_SECRET_KEY          — sk_test_… (test) or sk_live_… (live)
//
// Actions (POST body):
//   { action: "create-invoice", payment_id, callback_url }
//     → returns { invoice_url, moyasar_id }
//   { action: "verify", payment_id, moyasar_id? }
//     → fetches Moyasar invoice/payment, marks paid/failed in DB
//   { action: "refund", payment_id, amount_halalas?, reason? }
//     → admin only; calls Moyasar refund + DB update

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MOYASAR_SECRET_KEY = Deno.env.get("MOYASAR_SECRET_KEY") ?? "";

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

function moyasarAuthHeader(): string {
  // Moyasar uses HTTP basic auth: secret_key as username, blank password.
  const encoded = btoa(`${MOYASAR_SECRET_KEY}:`);
  return `Basic ${encoded}`;
}

async function moyasarFetch(
  path: string,
  init: RequestInit & { jsonBody?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const { jsonBody, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Authorization", moyasarAuthHeader());
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

// Moyasar accepts form-encoded bodies; flatten nested objects with bracket keys.
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

async function userScopedClient(authHeader: string | null) {
  if (!authHeader) throw new Error("missing_authorization");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
}

function serviceRoleClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// ----------------------------------------------------------------
// Action handlers
// ----------------------------------------------------------------

async function handleCreateInvoice(req: Request, body: any) {
  const auth = req.headers.get("authorization");
  const userClient = await userScopedClient(auth);
  const admin = serviceRoleClient();

  const paymentId: string | undefined = body?.payment_id;
  const callbackUrl: string | undefined = body?.callback_url;
  if (!paymentId || !callbackUrl) {
    return json({ error: "payment_id and callback_url are required" }, 400);
  }

  // Read payment + booking via the user's RLS so we can't quietly create
  // invoices for someone else's payment. The RPC inserts already validated
  // ownership; this read is the second safety check.
  const { data: payment, error: payErr } = await userClient
    .from("payments")
    .select(
      "id, kind, amount_halalas, currency, description, status, moyasar_id, booking_id, user_id",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (payErr || !payment) {
    return json({ error: "payment_not_found" }, 404);
  }
  if (payment.status === "paid" || payment.status === "refunded") {
    return json({ error: "payment_finalized" }, 409);
  }

  // Customer name (used by the hosted form for receipt display).
  const { data: { user } } = await userClient.auth.getUser();
  const { data: profile } = await userClient
    .from("users")
    .select("full_name, email")
    .eq("auth_user_id", user?.id ?? "")
    .maybeSingle();

  // Reuse an existing in-flight Moyasar invoice if we have one — Moyasar's
  // invoice URL is single-use but the resource itself can still be queried.
  // Most of the time this branch won't fire.
  if (payment.moyasar_id) {
    const existing = await moyasarFetch(`/invoices/${payment.moyasar_id}`);
    if (existing.ok && existing.data?.status === "initiated") {
      return json({
        invoice_url: existing.data.url,
        moyasar_id: payment.moyasar_id,
      });
    }
  }

  // Create the invoice. Description must be present for the receipt.
  const created = await moyasarFetch("/invoices", {
    method: "POST",
    jsonBody: {
      amount: payment.amount_halalas,
      currency: payment.currency || "SAR",
      description: payment.description || `Payment ${payment.id}`,
      callback_url: callbackUrl,
      success_url: callbackUrl,
      back_url: callbackUrl,
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
  // Record the moyasar id (service role: the user's row only allows
  // reads via RLS, not the update we need on payments).
  await admin.rpc("mark_payment_initiated", {
    p_payment_id: payment.id,
    p_moyasar_id: invoice.id,
  });

  return json({ invoice_url: invoice.url, moyasar_id: invoice.id });
}

async function handleVerify(req: Request, body: any) {
  const auth = req.headers.get("authorization");
  const userClient = await userScopedClient(auth);
  const admin = serviceRoleClient();

  const paymentId: string | undefined = body?.payment_id;
  const moyasarIdParam: string | undefined = body?.moyasar_id;
  if (!paymentId) return json({ error: "payment_id required" }, 400);

  const { data: payment } = await userClient
    .from("payments")
    .select("id, kind, amount_halalas, status, moyasar_id, booking_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return json({ error: "payment_not_found" }, 404);
  if (payment.status === "paid") {
    return json({ status: "paid", payment });
  }

  const moyasarId = payment.moyasar_id || moyasarIdParam;
  if (!moyasarId) return json({ error: "no_moyasar_reference" }, 400);

  // Fetch the invoice and (if it has one) its underlying payment.
  const inv = await moyasarFetch(`/invoices/${moyasarId}`);
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

async function handleRefund(req: Request, body: any) {
  const auth = req.headers.get("authorization");
  const userClient = await userScopedClient(auth);
  const admin = serviceRoleClient();

  // Admin-only.
  const { data: isAdminRow } = await userClient.rpc("is_admin");
  if (!isAdminRow) return json({ error: "forbidden" }, 403);

  const paymentId: string | undefined = body?.payment_id;
  const reason: string | undefined = body?.reason;
  if (!paymentId) return json({ error: "payment_id required" }, 400);

  const { data: payment } = await admin
    .from("payments")
    .select("id, moyasar_id, amount_halalas, refunded_amount_halalas, kind, booking_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return json({ error: "payment_not_found" }, 404);
  if (!payment.moyasar_id) return json({ error: "no_moyasar_id" }, 400);

  // Determine refund amount — either explicit or computed from booking rules.
  let amountHalalas: number | undefined = body?.amount_halalas;
  if (!amountHalalas && payment.kind === "booking_deposit") {
    const { data: amount } = await admin.rpc("compute_refund_amount", {
      p_booking_id: payment.booking_id,
    });
    amountHalalas = Math.round(Number(amount ?? 0) * 100);
  }
  if (!amountHalalas || amountHalalas <= 0) {
    return json({ error: "no_refundable_amount" }, 400);
  }

  // Moyasar refund: POST /payments/{id}/refund   amount=halalas
  // (refunds happen on the underlying payment id, which we may have stored
  // separately, but for invoices the moyasar_id == invoice id; resolve via
  // the invoice if we don't have a direct payment reference.)
  let targetPaymentId = payment.moyasar_id;
  const inv = await moyasarFetch(`/invoices/${payment.moyasar_id}`);
  if (inv.ok) {
    const paid = inv.data?.payments?.find((p: any) => p?.status === "paid");
    if (paid?.id) targetPaymentId = paid.id;
  }

  const refunded = await moyasarFetch(
    `/payments/${targetPaymentId}/refund`,
    { method: "POST", jsonBody: { amount: amountHalalas } },
  );
  if (!refunded.ok) {
    return json(
      { error: "moyasar_refund_failed", detail: refunded.data },
      refunded.status || 502,
    );
  }

  await admin.rpc("mark_payment_refunded", {
    p_payment_id: payment.id,
    p_refunded_halalas: amountHalalas,
    p_reason: reason ?? null,
  });

  return json({ status: "refunded", amount_halalas: amountHalalas });
}

// ----------------------------------------------------------------
// Router
// ----------------------------------------------------------------
serve(async (req: Request) => {
  console.log(
    "[moyasar] reached",
    req.method,
    "auth=",
    req.headers.get("authorization") ? "present" : "missing",
    "apikey=",
    req.headers.get("apikey") ? "present" : "missing",
  );
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

  if (!MOYASAR_SECRET_KEY) {
    return json({ error: "moyasar_not_configured" }, 500);
  }

  try {
    switch (body?.action) {
      case "create-invoice":
        return await handleCreateInvoice(req, body);
      case "verify":
        return await handleVerify(req, body);
      case "refund":
        return await handleRefund(req, body);
      case "process-payouts":
        return await handleProcessPayouts(req);
      case "create-payout":
        return await handleCreatePayout(req, body);
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal";
    console.error("[moyasar]", msg);
    return json({ error: msg }, 500);
  }
});

// ----------------------------------------------------------------
// Payouts (Moyasar Payouts API — POST /payouts)
// ----------------------------------------------------------------

const MOYASAR_PAYOUT_SOURCE_ID = Deno.env.get("MOYASAR_PAYOUT_SOURCE_ID") ?? "";

/**
 * Process a single payout row by ID. Admin-only.
 * Body: { action: "create-payout", payout_id: "..." }
 */
async function handleCreatePayout(req: Request, body: any) {
  const auth = req.headers.get("authorization");
  const userClient = await userScopedClient(auth);
  const admin = serviceRoleClient();

  const { data: isAdminRow } = await userClient.rpc("is_admin");
  if (!isAdminRow) return json({ error: "forbidden" }, 403);

  const payoutId: string | undefined = body?.payout_id;
  if (!payoutId) return json({ error: "payout_id required" }, 400);

  const result = await processPayoutRow(admin, payoutId);
  return json(result, result.error ? 502 : 200);
}

/**
 * Run all queued payouts. Idempotent — safe to call from a cron job
 * or from an admin button.
 * Body: { action: "process-payouts" }
 */
async function handleProcessPayouts(req: Request) {
  const auth = req.headers.get("authorization");
  const userClient = await userScopedClient(auth);
  const admin = serviceRoleClient();

  const { data: isAdminRow } = await userClient.rpc("is_admin");
  if (!isAdminRow) return json({ error: "forbidden" }, 403);

  const { data: rows, error } = await admin
    .from("provider_payouts")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return json({ error: error.message }, 500);

  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];
  for (const row of rows ?? []) {
    const r = await processPayoutRow(admin, (row as { id: string }).id);
    results.push({
      id: (row as { id: string }).id,
      ok: !r.error,
      reason: r.error,
    });
  }
  return json({ processed: results.length, results });
}

/**
 * Core: takes a payout row id, fetches its details + the provider's
 * IBAN, calls Moyasar `POST /payouts`, and updates the DB row.
 */
async function processPayoutRow(
  admin: ReturnType<typeof serviceRoleClient>,
  payoutId: string,
): Promise<{ moyasar_id?: string; error?: string }> {
  if (!MOYASAR_PAYOUT_SOURCE_ID) {
    return { error: "MOYASAR_PAYOUT_SOURCE_ID env var not set" };
  }

  const { data: payout, error: pErr } = await admin
    .from("provider_payouts")
    .select(
      "id, provider_id, booking_id, amount_halalas, status, payout_type",
    )
    .eq("id", payoutId)
    .maybeSingle();
  if (pErr || !payout) return { error: "payout_not_found" };
  if (payout.status !== "queued") {
    return { error: `payout_not_queued_${payout.status}` };
  }

  const { data: provider } = await admin
    .from("providers")
    .select("id, name, name_ar, iban, phone")
    .eq("id", payout.provider_id)
    .maybeSingle();
  if (!provider) return { error: "provider_not_found" };
  if (!provider.iban) return { error: "provider_has_no_iban" };

  // Call Moyasar Payouts API.
  const created = await moyasarFetch("/payouts", {
    method: "POST",
    jsonBody: {
      source_id: MOYASAR_PAYOUT_SOURCE_ID,
      amount: payout.amount_halalas,
      purpose: "payment_to_merchant",
      comment: `Farah booking ${payout.booking_id ?? "(no-booking)"} — ${payout.payout_type}`,
      destination: {
        type: "bank",
        iban: provider.iban,
        name: provider.name_ar ?? provider.name ?? "Provider",
        mobile: provider.phone ?? undefined,
        country: "SA",
      },
      metadata: {
        farah_payout_id: payout.id,
        farah_booking_id: payout.booking_id,
        farah_provider_id: payout.provider_id,
      },
    },
  });

  if (!created.ok) {
    const reason =
      created.data?.message ??
      created.data?.errors?.[0]?.message ??
      `http_${created.status}`;
    await admin
      .from("provider_payouts")
      .update({
        status: "failed",
        failure_reason: reason,
      })
      .eq("id", payout.id);
    return { error: reason };
  }

  const moyasarId = created.data?.id as string | undefined;
  const moyasarStatus = (created.data?.status as string) ?? "initiated";
  await admin
    .from("provider_payouts")
    .update({
      status: moyasarStatus === "completed" ? "completed" : "initiated",
      moyasar_payout_id: moyasarId,
      initiated_at: new Date().toISOString(),
      completed_at:
        moyasarStatus === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", payout.id);

  return { moyasar_id: moyasarId };
}
