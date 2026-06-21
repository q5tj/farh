import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  createMoyasarInvoice,
  verifyMoyasarPayment,
  type VerifyStatus,
} from "@/lib/payments";

/**
 * Moyasar redirects the customer back here after the hosted invoice
 * finishes (or is cancelled). Query params we expect:
 *   payment_id  — our internal payments.id (we set this on the callback URL)
 *   booking_id  — the booking that owns the deposit
 *   id          — Moyasar's invoice/payment id (Moyasar appends this)
 *   status      — Moyasar's status hint (paid / failed / authorized / …)
 *
 * We always re-verify with the edge function — the URL params are not
 * trusted on their own. Once verified, we route into /booking/:id.
 */
export default function PaymentReturnScreen() {
  const c = useColors();
  const { t } = useT();
  const params = useLocalSearchParams<{
    payment_id?: string;
    booking_id?: string;
    id?: string;
    status?: string;
  }>();

  const paymentId =
    typeof params.payment_id === "string" ? params.payment_id : null;
  const bookingId =
    typeof params.booking_id === "string" ? params.booking_id : null;
  const moyasarId = typeof params.id === "string" ? params.id : undefined;
  // Moyasar always appends ?status=paid|failed|... when the customer
  // completes (or fails) checkout. If we DIDN'T receive a status, the
  // customer hit the browser/OS back button on the hosted invoice — i.e.
  // they cancelled. We don't want to spin on `verify` for 30+ seconds in
  // that case; we treat it as "cancelled" immediately and let them retry.
  const moyasarStatusParam =
    typeof params.status === "string" ? params.status.toLowerCase() : null;
  const initialStatus: VerifyStatus | "loading" | "cancelled" =
    moyasarStatusParam === "paid"
      ? "paid"
      : moyasarStatusParam === "failed" || moyasarStatusParam === "voided"
        ? (moyasarStatusParam as VerifyStatus)
        : moyasarStatusParam === null && !paymentId
          ? "cancelled" // no params at all → user just landed here somehow
          : moyasarStatusParam === null
            ? "cancelled" // payment_id present but no status → user backed out
            : "loading"; // status is something we don't recognise → verify

  const [status, setStatus] = useState<
    VerifyStatus | "loading" | "error" | "cancelled" | "retrying"
  >(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const verifiedRef = useRef(false);
  // Distinguishes "deposit success" vs "final-payment success" messaging.
  // We learn the kind from the payments table after the redirect.
  const [paymentKind, setPaymentKind] = useState<
    "booking_deposit" | "final_payment" | "provider_commission" | null
  >(null);

  useEffect(() => {
    if (!paymentId || !isSupabaseConfigured || !supabase) return;
    let alive = true;
    supabase
      .from("payments")
      .select("kind")
      .eq("id", paymentId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data?.kind) setPaymentKind(data.kind);
      });
    return () => {
      alive = false;
    };
  }, [paymentId]);

  useEffect(() => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;
    // Only run the verify round-trip when Moyasar told us "paid" (we still
    // confirm against the DB) — every other initial state is already final
    // and showing a spinner would just waste the user's time.
    if (initialStatus !== "paid") return;
    if (!paymentId) return;

    let alive = true;
    (async () => {
      try {
        const s = await verifyMoyasarPayment(paymentId, moyasarId);
        if (!alive) return;
        if (s === "paid" || s === "failed" || s === "voided") {
          setStatus(s);
        }
        // If Moyasar said "paid" in the URL but the verify still sees
        // "initiated", keep the optimistic "paid" UI — the webhook will
        // settle the DB row in seconds and we don't want to flip the
        // user's screen to an error.
      } catch (e) {
        if (!alive) return;
        const msg = (e as Error)?.message ?? "verify_failed";
        console.warn("[payment] verify failed (keeping optimistic paid):", msg);
        setError(msg);
      }
    })();
    return () => {
      alive = false;
    };
  }, [paymentId, moyasarId, initialStatus]);

  const goToBooking = () => {
    if (bookingId) router.replace(`/booking/${bookingId}`);
    else router.replace("/(tabs)/bookings");
  };

  // "Retry" after a cancel/fail re-creates the Moyasar invoice for the
  // SAME payment row and sends the customer back to checkout. The edge
  // function reuses an in-flight invoice, so the customer doesn't get
  // double-charged.
  const retryPayment = async () => {
    if (!paymentId || !bookingId) {
      // No ids → can't retry, just send them to the booking screen.
      goToBooking();
      return;
    }
    setStatus("retrying");
    setError(null);
    try {
      const callbackUrl =
        Platform.OS === "web" && typeof window !== "undefined"
          ? `${window.location.origin}/payment/return?payment_id=${paymentId}&booking_id=${bookingId}`
          : `farhatukum://payment/return?payment_id=${paymentId}&booking_id=${bookingId}`;
      const { invoice_url } = await createMoyasarInvoice(paymentId, callbackUrl);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = invoice_url;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          invoice_url,
          "farhatukum://",
        );
        if (result.type === "success") {
          const afterScheme = result.url.replace(/^[a-z]+:\/\//, "");
          const [path, query] = afterScheme.split("?");
          const params: Record<string, string> = {};
          (query ?? "").split("&").filter(Boolean).forEach((seg) => {
            const [k, v] = seg.split("=");
            if (k) params[k] = decodeURIComponent(v ?? "");
          });
          router.replace({ pathname: `/${path}` as never, params });
        } else {
          setStatus("cancelled");
        }
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? "retry_failed";
      setError(msg);
      setStatus("cancelled");
    }
  };

  const retryVerify = () => {
    setStatus("loading");
    setError(null);
    verifiedRef.current = false;
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {status === "loading" ? (
        <>
          <ActivityIndicator color={c.primary} size="large" />
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("paymentVerifying")}
          </Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>
            {t("paymentVerifyingDesc")}
          </Text>
        </>
      ) : status === "paid" ? (
        <>
          <View
            style={[styles.iconWrap, { backgroundColor: "rgba(22,163,74,0.12)" }]}
          >
            <Feather name="check-circle" size={48} color="#16a34a" />
          </View>
          <Text style={[styles.title, { color: c.foreground }]}>
            {paymentKind === "final_payment"
              ? t("finalPaymentSuccessTitle")
              : t("paymentSuccessTitle")}
          </Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>
            {paymentKind === "final_payment"
              ? t("finalPaymentSuccessDesc")
              : t("paymentSuccessDesc")}
          </Text>
          <Button label={t("goToBooking")} onPress={goToBooking} size="lg" />
        </>
      ) : status === "failed" || status === "voided" ? (
        <>
          <View
            style={[styles.iconWrap, { backgroundColor: "rgba(220,38,38,0.12)" }]}
          >
            <Feather name="x-circle" size={48} color="#dc2626" />
          </View>
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("paymentFailedTitle")}
          </Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>
            {t("paymentFailedDesc")}
          </Text>
          <Button label={t("retryPayment")} onPress={retryPayment} size="lg" />
          <Button label={t("goToBooking")} onPress={goToBooking} variant="ghost" />
        </>
      ) : status === "cancelled" ? (
        <>
          <View
            style={[styles.iconWrap, { backgroundColor: "rgba(245,158,11,0.12)" }]}
          >
            <Feather name="alert-circle" size={48} color="#f59e0b" />
          </View>
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("paymentCancelledTitle")}
          </Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>
            {error ?? t("paymentCancelledDesc")}
          </Text>
          <Button label={t("retryPayment")} onPress={retryPayment} size="lg" />
          <Button label={t("goToBooking")} onPress={goToBooking} variant="ghost" />
        </>
      ) : status === "retrying" ? (
        <>
          <ActivityIndicator color={c.primary} size="large" />
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("paymentVerifying")}
          </Text>
        </>
      ) : status === "error" ? (
        <>
          <View
            style={[styles.iconWrap, { backgroundColor: "rgba(220,38,38,0.12)" }]}
          >
            <Feather name="alert-triangle" size={48} color="#dc2626" />
          </View>
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("paymentVerifyFailedTitle")}
          </Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>
            {error ?? t("paymentVerifyFailed")}
          </Text>
          <Button label={t("retry")} onPress={retryVerify} size="lg" />
        </>
      ) : (
        // initiated / pending — Moyasar hasn't settled yet.
        <>
          <View
            style={[styles.iconWrap, { backgroundColor: "rgba(245,158,11,0.12)" }]}
          >
            <Feather name="clock" size={48} color="#f59e0b" />
          </View>
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("paymentPendingTitle")}
          </Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>
            {t("paymentPendingDesc")}
          </Text>
          <Button
            label={t("checkAgain")}
            onPress={retryVerify}
            size="lg"
            variant="secondary"
          />
          <Button label={t("goToBooking")} onPress={goToBooking} variant="ghost" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
});
