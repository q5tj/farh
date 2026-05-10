import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { verifyMoyasarPayment, type VerifyStatus } from "@/lib/payments";

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
  // Moyasar always appends ?status=paid|failed|... to the callback URL.
  // We trust this for the *initial* UI state so the customer sees their
  // result instantly. The edge function verify call still runs in the
  // background and is what actually marks the booking paid in our DB.
  const moyasarStatusParam =
    typeof params.status === "string" ? params.status.toLowerCase() : null;
  const initialStatus: VerifyStatus | "loading" =
    moyasarStatusParam === "paid"
      ? "paid"
      : moyasarStatusParam === "failed" || moyasarStatusParam === "voided"
        ? (moyasarStatusParam as VerifyStatus)
        : "loading";

  const [status, setStatus] = useState<VerifyStatus | "loading" | "error">(
    initialStatus,
  );
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
    if (!paymentId) {
      if (!moyasarStatusParam) {
        setError(t("paymentMissingId"));
        setStatus("error");
      }
      // If we have a status from Moyasar but no payment_id, just show
      // the optimistic state — verify can't run without our internal id.
      return;
    }
    let alive = true;

    async function check() {
      let attempts = 0;
      // Moyasar's invoice settle is usually instant after the redirect, but
      // we retry a couple of times in case the webhook is still in flight.
      while (alive && attempts < 3) {
        try {
          const s = await verifyMoyasarPayment(paymentId!, moyasarId);
          if (!alive) return;
          if (s === "paid" || s === "failed" || s === "voided") {
            setStatus(s);
            return;
          }
        } catch (e) {
          if (!alive) return;
          // Don't override an optimistic "paid" state with a verify error —
          // the customer's card *was* charged per Moyasar, the DB sync just
          // takes a moment. Show a soft warning if we never reach a
          // terminal state.
          if (initialStatus !== "paid") {
            setError((e as Error)?.message ?? t("paymentVerifyFailed"));
          }
        }
        attempts += 1;
        await new Promise((r) => setTimeout(r, 1500));
      }
      // If we never confirmed and never had an optimistic state, fall back
      // to "initiated" so the user sees the pending UI with a retry button.
      if (alive && initialStatus === "loading") setStatus("initiated");
    }
    check();
    return () => {
      alive = false;
    };
  }, [paymentId, moyasarId, t, moyasarStatusParam, initialStatus]);

  const goToBooking = () => {
    if (bookingId) router.replace(`/booking/${bookingId}`);
    else router.replace("/(tabs)/bookings");
  };
  const retry = () => {
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
          <Button label={t("goToBooking")} onPress={goToBooking} size="lg" />
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
          <Button label={t("retry")} onPress={retry} size="lg" />
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
            onPress={retry}
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
