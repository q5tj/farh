/**
 * Client-side wrapper around the Supabase `moyasar` Edge Function.
 *
 * Three-step deposit flow:
 *   1. createBookingDepositPaymentRow(bookingId)
 *      → DB row in `payments` (status=pending) via SECURITY DEFINER RPC
 *   2. createMoyasarInvoice(paymentId, callbackUrl)
 *      → Moyasar hosted invoice URL — open it in WebView/browser
 *   3. verifyPayment(paymentId)
 *      → after redirect back, confirm with Moyasar and update the row.
 *         Idempotent — safe to call repeatedly.
 *
 * Provider commission flow uses the same shape with
 * createCommissionPaymentRow(bookingId).
 */

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase ليس مهيأً");
  }
  return supabase;
}

// ============================================================
// DB-side: create a pending payment row
// ============================================================

/** Customer creates the deposit row for a booking they own. */
export async function createBookingDepositPaymentRow(
  bookingId: string,
): Promise<string> {
  const { data, error } = await client().rpc(
    "create_booking_deposit_pending",
    { p_booking_id: bookingId },
  );
  if (error) throw error;
  return data as string;
}

/** Provider creates the commission row for a booking they own. */
export async function createCommissionPaymentRow(
  bookingId: string,
): Promise<string> {
  const { data, error } = await client().rpc(
    "create_commission_payment_pending",
    { p_booking_id: bookingId },
  );
  if (error) throw error;
  return data as string;
}

// ============================================================
// Edge function: Moyasar interaction
// ============================================================

interface InvokeResult<T> {
  data: T | null;
  error: { message: string; details?: unknown } | null;
}

async function invokeMoyasar<T>(
  body: Record<string, unknown>,
): Promise<InvokeResult<T>> {
  const c = client();
  const { data, error } = await c.functions.invoke("moyasar", { body });
  if (error) {
    return { data: null, error: { message: error.message } };
  }
  if (data && typeof data === "object" && "error" in data) {
    return {
      data: null,
      error: { message: String((data as any).error), details: data },
    };
  }
  return { data: data as T, error: null };
}

export interface CreateInvoiceResult {
  invoice_url: string;
  moyasar_id: string;
}

/**
 * Ask the edge function to create a hosted Moyasar invoice for a payment row.
 * Returns the URL the customer should be redirected to.
 *
 * @param callbackUrl
 *   Where Moyasar should send the customer after they finish (success or
 *   cancel). For Expo this is typically `<origin>/payment/return?payment_id=…`.
 */
export async function createMoyasarInvoice(
  paymentId: string,
  callbackUrl: string,
): Promise<CreateInvoiceResult> {
  const { data, error } = await invokeMoyasar<CreateInvoiceResult>({
    action: "create-invoice",
    payment_id: paymentId,
    callback_url: callbackUrl,
  });
  if (error || !data) {
    throw new Error(error?.message || "create_invoice_failed");
  }
  return data;
}

export type VerifyStatus =
  | "paid"
  | "failed"
  | "initiated"
  | "expired"
  | "voided";

/**
 * After the user returns from Moyasar, ask the edge function to query
 * Moyasar and update the DB. Safe to poll — already-paid rows are returned
 * idempotently as `paid`.
 */
export async function verifyMoyasarPayment(
  paymentId: string,
  moyasarId?: string,
): Promise<VerifyStatus> {
  const { data, error } = await invokeMoyasar<{ status: VerifyStatus }>({
    action: "verify",
    payment_id: paymentId,
    moyasar_id: moyasarId,
  });
  if (error || !data) {
    throw new Error(error?.message || "verify_failed");
  }
  return data.status;
}

/**
 * Admin only — request a Moyasar refund for a payment.
 * If `amountHalalas` is omitted, uses the booking-rule based amount
 * computed by `compute_refund_amount` server-side.
 */
export async function refundMoyasarPayment(
  paymentId: string,
  options: { amountHalalas?: number; reason?: string } = {},
): Promise<{ amountHalalas: number }> {
  const { data, error } = await invokeMoyasar<{
    status: "refunded";
    amount_halalas: number;
  }>({
    action: "refund",
    payment_id: paymentId,
    amount_halalas: options.amountHalalas,
    reason: options.reason,
  });
  if (error || !data) {
    throw new Error(error?.message || "refund_failed");
  }
  return { amountHalalas: data.amount_halalas };
}

// ============================================================
// Read-side helpers
// ============================================================

export interface PaymentRow {
  id: string;
  bookingId: string;
  kind: "booking_deposit" | "provider_commission";
  status:
    | "pending"
    | "initiated"
    | "paid"
    | "failed"
    | "refunded"
    | "voided";
  amountSar: number;
  appShareSar: number;
  providerNetSar: number;
  refundedSar: number;
  createdAt: string;
  paidAt: string | null;
}

interface PaymentRowDb {
  id: string;
  booking_id: string;
  kind: "booking_deposit" | "provider_commission";
  status: PaymentRow["status"];
  amount_halalas: number;
  app_share_halalas: number;
  provider_net_halalas: number;
  refunded_amount_halalas: number;
  created_at: string;
  paid_at: string | null;
}

function mapPayment(row: PaymentRowDb): PaymentRow {
  return {
    id: row.id,
    bookingId: row.booking_id,
    kind: row.kind,
    status: row.status,
    amountSar: (row.amount_halalas ?? 0) / 100,
    appShareSar: (row.app_share_halalas ?? 0) / 100,
    providerNetSar: (row.provider_net_halalas ?? 0) / 100,
    refundedSar: (row.refunded_amount_halalas ?? 0) / 100,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

/** Fetch payments for a booking (RLS scopes to viewer). */
export async function fetchBookingPayments(
  bookingId: string,
): Promise<PaymentRow[]> {
  const { data, error } = await client()
    .from("payments")
    .select(
      "id, booking_id, kind, status, amount_halalas, app_share_halalas, provider_net_halalas, refunded_amount_halalas, created_at, paid_at",
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapPayment(r as PaymentRowDb));
}

/** Compute the deposit a service price would require, server-side. */
export async function computeDepositAmount(
  servicePrice: number,
): Promise<number> {
  const { data, error } = await client().rpc("compute_deposit_amount", {
    p_service_price: servicePrice,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Ask the DB how much would be refunded if a booking were cancelled now.
 * Uses the same `compute_refund_amount` rule the admin/refund flow uses.
 * Returns SAR (the RPC already speaks SAR), or 0 if not eligible.
 */
export async function computeRefundAmount(bookingId: string): Promise<number> {
  const { data, error } = await client().rpc("compute_refund_amount", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
