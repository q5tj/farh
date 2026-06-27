import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Stars } from "@/components/ui/Stars";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { COVER_BY_CATEGORY, DEFAULT_COVER } from "@/constants/seedData";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { infoDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import {
  cancelBooking as cancelBookingDb,
  fetchBookingById,
  fetchPaymentSettings,
  fetchProviderById,
  type Booking,
  type PaymentSettings,
  type Provider,
  type RefundStatus,
} from "@/lib/data";
import { isMapUrl, parseLocation } from "@/lib/location";
import {
  computeRefundAmount,
  createBookingDepositPaymentRow,
  createFinalPaymentRow,
  createMoyasarInvoice,
  fetchBookingPayments,
  MOYASAR_ERROR_CODES,
} from "@/lib/payments";

function paymentErrorMessage(
  e: unknown,
  t: (key: "paymentProviderNotConnected" | "paymentProviderKeysUnverified" | "paymentInitFailed") => string,
): string {
  const raw = (e as Error)?.message;
  if (raw === MOYASAR_ERROR_CODES.providerNotConnected) {
    return t("paymentProviderNotConnected");
  }
  if (raw === MOYASAR_ERROR_CODES.providerKeysUnverified) {
    return t("paymentProviderKeysUnverified");
  }
  return raw ?? t("paymentInitFailed");
}

export default function BookingDetailScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = String(id);
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";
  const { bookings, providerBookings, getProvider, updateBookingStatus } =
    useApp();

  const cachedBooking =
    bookings.find((b) => b.id === bookingId) ??
    providerBookings.find((b) => b.id === bookingId) ??
    null;
  const [booking, setBooking] = useState<Booking | null>(cachedBooking);
  const [provider, setProvider] = useState<Provider | null>(
    cachedBooking ? getProvider(cachedBooking.providerId) ?? null : null,
  );
  const [loading, setLoading] = useState(!cachedBooking);

  useEffect(() => {
    let alive = true;
    if (cachedBooking) {
      setBooking(cachedBooking);
      const cachedProvider = getProvider(cachedBooking.providerId);
      if (cachedProvider) {
        setProvider(cachedProvider);
      } else {
        fetchProviderById(cachedBooking.providerId, lang).then((p) => {
          if (alive) setProvider(p);
        });
      }
      setLoading(false);
      return () => {
        alive = false;
      };
    }
    setLoading(true);
    fetchBookingById(bookingId, lang)
      .then(async (b) => {
        if (!alive) return;
        setBooking(b);
        if (b) {
          const p = getProvider(b.providerId);
          if (p) {
            setProvider(p);
          } else {
            const fetched = await fetchProviderById(b.providerId, lang);
            if (alive) setProvider(fetched);
          }
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [bookingId, cachedBooking, getProvider, lang]);

  // All useState/useEffect/useMemo MUST live above the early returns
  // to satisfy the rules of hooks (https://react.dev/link/rules-of-hooks).
  // Letting them sit below the loading/not-found guards used to be
  // tolerated by React in lenient builds but Strict Mode + the React
  // Compiler in v36 turn it into a hard crash with "Rendered more
  // hooks than during the previous render".
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [paySettings, setPaySettings] = useState<PaymentSettings | null>(null);
  const [refundPreview, setRefundPreview] = useState<number | null>(null);
  const [payingFinal, setPayingFinal] = useState(false);
  const [payingDeposit, setPayingDeposit] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPaymentSettings()
      .then((s) => alive && setPaySettings(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Recompute the refund preview when the deposit-paid booking is still
  // cancellable. Cheap RPC call — invoked once per booking-id load.
  useEffect(() => {
    if (!booking) return;
    if (!booking.depositPaidAt) {
      setRefundPreview(null);
      return;
    }
    if (booking.status !== "pending" && booking.status !== "accepted") {
      setRefundPreview(null);
      return;
    }
    let alive = true;
    computeRefundAmount(booking.id)
      .then((sar) => alive && setRefundPreview(sar))
      .catch(() => alive && setRefundPreview(null));
    return () => {
      alive = false;
    };
  }, [booking?.id, booking?.depositPaidAt, booking?.status]);

  const daysToEvent = useMemo(() => {
    if (!booking) return null;
    const start = new Date(booking.startAt).getTime();
    const now = Date.now();
    const diffMs = start - now;
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [booking?.startAt]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title={t("bookingDetails")} />
        <View style={{ padding: 24 }}>
          <Text style={{ color: c.foreground }}>الحجز غير موجود</Text>
        </View>
      </View>
    );
  }

  const cover = provider?.coverUrl
    ? { uri: provider.coverUrl }
    : COVER_BY_CATEGORY[provider?.categorySlug ?? ""] ?? DEFAULT_COVER;

  // v35: deposit (10% of price) — paid to the PROVIDER's account.
  // Reuses any in-flight payment row so a bounce out of Moyasar and
  // back doesn't create a second charge.
  const startDepositPayment = async () => {
    if (!booking) return;
    setPayingDeposit(true);
    try {
      const existing = await fetchBookingPayments(booking.id);
      const pending = existing.find(
        (p) => p.kind === "booking_deposit" && p.status === "pending",
      );
      const paymentId = pending
        ? pending.id
        : await createBookingDepositPaymentRow(booking.id);
      const webOrigin =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin
          : "https://farhatukum.com";
      const callbackUrl = `${webOrigin}/payment/return?payment_id=${paymentId}&booking_id=${booking.id}`;
      const { invoice_url } = await createMoyasarInvoice(paymentId, callbackUrl);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = invoice_url;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          invoice_url,
          "https://farhatukum.com/payment/return",
        );
        if (result.type === "success") {
          const q = result.url.split("?")[1] ?? "";
          const params: Record<string, string> = {};
          q.split("&").filter(Boolean).forEach((seg) => {
            const [k, v] = seg.split("=");
            if (k) params[k] = decodeURIComponent(v ?? "");
          });
          router.replace({ pathname: "/payment/return", params } as never);
        }
      }
    } catch (e) {
      const msg = paymentErrorMessage(e, t);
      await infoDialog({ title: t("error"), message: msg });
    } finally {
      setPayingDeposit(false);
    }
  };

  // v42: final 90% — paid directly to the PROVIDER's own Moyasar
  // account (same as the deposit). The provider then owes platform
  // commission on the full price, billed automatically as soon as this
  // payment clears — they settle it from their statement screen.
  const startFinalPayment = async () => {
    if (!booking) return;
    setPayingFinal(true);
    try {
      const paymentId = await createFinalPaymentRow(booking.id);
      const webOrigin =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin
          : "https://farhatukum.com";
      const callbackUrl = `${webOrigin}/payment/return?payment_id=${paymentId}&booking_id=${booking.id}`;
      const { invoice_url } = await createMoyasarInvoice(paymentId, callbackUrl);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = invoice_url;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          invoice_url,
          "https://farhatukum.com/payment/return",
        );
        if (result.type === "success") {
          const q = result.url.split("?")[1] ?? "";
          const params: Record<string, string> = {};
          q.split("&").filter(Boolean).forEach((seg) => {
            const [k, v] = seg.split("=");
            if (k) params[k] = decodeURIComponent(v ?? "");
          });
          router.replace({ pathname: "/payment/return", params } as never);
        }
      }
    } catch (e) {
      const msg = paymentErrorMessage(e, t);
      await infoDialog({ title: t("error"), message: msg });
    } finally {
      setPayingFinal(false);
    }
  };

  const submitCancel = async () => {
    setCancelling(true);
    try {
      await cancelBookingDb(booking.id, cancelReason);
      // Optimistic local refresh: re-fetch the row.
      const fresh = await fetchBookingById(booking.id, lang);
      if (fresh) setBooking(fresh);
      setCancelOpen(false);
      setCancelReason("");
    } catch (e) {
      const msg = (e as Error)?.message ?? t("cancelBookingFailed");
      await infoDialog({ title: t("error"), message: msg });
    } finally {
      setCancelling(false);
    }
  };

  const canRate = booking.status === "completed" && booking.rating == null;
  const canCancel =
    (booking.status === "pending" || booking.status === "accepted") &&
    !!booking.depositPaidAt;
  // v31: cancel is gone. Reschedule is allowed up until
  // RESCHEDULE_MIN_HOURS before the original start. The client-side
  // cutoff matches the server-side check in `request_reschedule`.
  const RESCHEDULE_MIN_HOURS = 48;
  const hoursUntilStart = booking.startAt
    ? (new Date(booking.startAt).getTime() - Date.now()) / (1000 * 60 * 60)
    : 0;
  const canReschedule =
    (booking.status === "pending" || booking.status === "accepted") &&
    booking.paymentStatus === "paid" &&
    booking.rescheduleStatus !== "pending" &&
    hoursUntilStart > RESCHEDULE_MIN_HOURS;

  const cancelledByLabel =
    booking.cancelledBy === "customer"
      ? t("cancelledByCustomer")
      : booking.cancelledBy === "provider"
        ? t("cancelledByProvider")
        : booking.cancelledBy === "admin"
          ? t("cancelledByAdmin")
          : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("bookingDetails")} />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 100,
        }}
      >
        <Card padded={false} style={{ overflow: "hidden" }}>
          <Image source={cover} style={styles.cover} />
          <View style={{ padding: 16 }}>
            <View style={styles.row}>
              <Text style={[styles.providerName, { color: c.foreground }]}>
                {provider?.name ?? "—"}
              </Text>
              <StatusBadge status={booking.status} />
            </View>
            <Text style={[styles.serviceTitle, { color: c.mutedForeground }]}>
              {booking.serviceTitle}
            </Text>
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={[styles.sectionTitle, { color: c.foreground }]}>
            {t("eventDetails")}
          </Text>
          <View style={{ marginTop: 12, gap: 14 }}>
            <DetailRow icon="calendar" label={t("selectDate")} value={booking.date} />
            <DetailRow icon="clock" label={t("selectTime")} value={booking.time} />
            <LocationRow location={booking.location} />
            {booking.notes ? (
              <DetailRow icon="file-text" label={t("notes")} value={booking.notes} />
            ) : null}
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <View style={styles.row}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              {t("paymentSummary")}
            </Text>
            <PaymentBadge status={booking.paymentStatus} />
          </View>
          <View style={{ marginTop: 14, gap: 10 }}>
            <View style={styles.row}>
              <Text style={[styles.payLabel, { color: c.mutedForeground }]}>
                {t("servicePrice")}
              </Text>
              <Text style={[styles.payValue, { color: c.foreground }]}>
                {booking.price.toLocaleString()} {t("sar")}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <View style={styles.row}>
              <Text style={[styles.totalLabel, { color: c.foreground }]}>
                {t("total")}
              </Text>
              <Text style={[styles.totalValue, { color: c.primary }]}>
                {booking.price.toLocaleString()} {t("sar")}
              </Text>
            </View>
          </View>
        </Card>

        {/* Deposit retry CTA — shown only while the booking is still pending
            payment and hasn't been cancelled. Gives the customer a way back
            to Moyasar after they bailed out of the first checkout. */}
        {booking.paymentStatus === "pending" &&
        !booking.depositPaidAt &&
        booking.status === "pending" ? (
          <Card style={{ marginTop: 14 }}>
            <View style={styles.cancelInfoHead}>
              <Feather name="alert-circle" size={18} color="#f59e0b" />
              <Text style={[styles.cancelInfoTitle, { color: c.foreground }]}>
                {t("depositPendingTitle")}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Cairo_400Regular",
                fontSize: 12,
                color: c.mutedForeground,
                marginTop: 6,
                lineHeight: 20,
                textAlign: "right",
              }}
            >
              {t("depositPendingDesc")}
            </Text>
            <View style={{ marginTop: 12 }}>
              <Button
                label={t("payDepositNow")}
                onPress={startDepositPayment}
                loading={payingDeposit}
                icon={<Feather name="credit-card" size={16} color="#ffffff" />}
              />
            </View>
          </Card>
        ) : null}

        {booking.rating ? (
          <Card style={{ marginTop: 14 }}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              {t("rateService")}
            </Text>
            <View style={{ marginTop: 12, gap: 8 }}>
              <Stars value={booking.rating} size={20} />
              {booking.reviewText ? (
                <Text style={[styles.reviewText, { color: c.mutedForeground }]}>
                  {booking.reviewText}
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        {canCancel && paySettings && booking.depositPaidAt ? (
          <Card style={{ marginTop: 14 }}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              {t("cancellationPolicyTitle")}
            </Text>
            <View style={{ marginTop: 10, gap: 6 }}>
              <Text style={[styles.policyLine, { color: c.mutedForeground }]}>
                •{" "}
                {t("cancellationFullRefundDesc", {
                  full: paySettings.cancellationWindowFullDays,
                })}
              </Text>
              <Text style={[styles.policyLine, { color: c.mutedForeground }]}>
                •{" "}
                {t("cancellationHalfRefundDesc", {
                  full: paySettings.cancellationWindowFullDays,
                  half: paySettings.cancellationWindowHalfDays,
                })}
              </Text>
              <Text style={[styles.policyLine, { color: c.mutedForeground }]}>
                •{" "}
                {t("cancellationNoRefundDesc", {
                  half: paySettings.cancellationWindowHalfDays,
                })}
              </Text>
            </View>
            {daysToEvent != null ? (
              <View
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: c.muted,
                }}
              >
                <Text style={[styles.policyHighlight, { color: c.foreground }]}>
                  {t("cancellationCurrentWindow", { days: daysToEvent })}
                </Text>
                {refundPreview != null ? (
                  <View style={[styles.row, { marginTop: 8 }]}>
                    <Text
                      style={[styles.payLabel, { color: c.mutedForeground }]}
                    >
                      {t("refundEstimateLabel")}
                    </Text>
                    <Text
                      style={[
                        styles.payValue,
                        {
                          color: refundPreview > 0 ? c.primary : c.destructive,
                        },
                      ]}
                    >
                      {refundPreview > 0
                        ? `${refundPreview.toLocaleString()} ${t("sar")}`
                        : t("refundNotEligible")}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>
        ) : null}

        {booking.finalPaymentMethod === "online" &&
        booking.finalPaymentStatus === "pending" ? (
          <Card
            style={{ marginTop: 14, borderColor: c.primary, borderWidth: 1 }}
          >
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              {t("finalPaymentTitle")}
            </Text>
            <Text
              style={{
                fontFamily: "Cairo_400Regular",
                fontSize: 12,
                color: c.mutedForeground,
                marginTop: 6,
                lineHeight: 20,
                textAlign: "right",
              }}
            >
              {t("finalPaymentDesc")}
            </Text>
            <View style={[styles.row, { marginTop: 12 }]}>
              <Text style={[styles.payLabel, { color: c.mutedForeground }]}>
                {t("remainingAmountLabel")}
              </Text>
              <Text style={[styles.payValue, { color: c.primary }]}>
                {Math.max(
                  0,
                  booking.price - (booking.depositAmount ?? 0),
                ).toLocaleString()}{" "}
                {t("sar")}
              </Text>
            </View>
            <View style={{ marginTop: 12 }}>
              <Button
                label={t("payRemainingNow")}
                onPress={startFinalPayment}
                loading={payingFinal}
                icon={<Feather name="credit-card" size={16} color="#ffffff" />}
              />
            </View>
          </Card>
        ) : null}

        {booking.finalPaymentStatus === "paid" &&
        booking.finalPaymentMethod === "online" ? (
          <Card style={{ marginTop: 14 }}>
            <View style={styles.cancelInfoHead}>
              <Feather name="check-circle" size={18} color={c.primary} />
              <Text style={[styles.cancelInfoTitle, { color: c.foreground }]}>
                {t("finalPaymentPaid")}
              </Text>
            </View>
          </Card>
        ) : null}

        <View style={{ marginTop: 18, gap: 10 }}>
          {provider?.phone && booking.depositPaidAt ? (
            <Button
              label={t("contactProvider")}
              variant="secondary"
              onPress={() => Linking.openURL(`tel:${provider.phone}`)}
              icon={<Feather name="phone" size={16} color={c.primary} />}
            />
          ) : provider?.phone ? (
            <View
              style={{
                padding: 12,
                borderRadius: 12,
                backgroundColor: c.muted,
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Feather name="lock" size={16} color={c.mutedForeground} />
              <Text
                style={{
                  flex: 1,
                  color: c.mutedForeground,
                  fontFamily: "Cairo_500Medium",
                  fontSize: 12,
                  textAlign: "right",
                  lineHeight: 19,
                }}
              >
                {t("contactProviderLockedAfterPayment")}
              </Text>
            </View>
          ) : null}
          {canRate ? (
            <Button
              label={t("rate")}
              onPress={() => router.push(`/rate/${booking.id}`)}
              icon={<Feather name="star" size={16} color="#ffffff" />}
            />
          ) : null}
          {canReschedule ? (
            <Button
              label={t("rescheduleBooking")}
              variant="secondary"
              icon={<Feather name="calendar" size={16} color={c.primary} />}
              onPress={() => router.push(`/reschedule/${booking.id}`)}
            />
          ) : booking.rescheduleStatus === "pending" ? (
            <View
              style={{
                padding: 12,
                borderRadius: 12,
                backgroundColor: "#fefce8",
                borderWidth: 1,
                borderColor: "#fde68a",
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Feather name="clock" size={16} color="#a16207" />
              <Text
                style={{
                  flex: 1,
                  color: "#713f12",
                  fontFamily: "Cairo_600SemiBold",
                  fontSize: 12,
                  textAlign: "right",
                }}
              >
                {t("reschedulePendingNote")}
              </Text>
            </View>
          ) : null}

          <Button
            label={t("showBookingStatus")}
            variant="ghost"
            icon={<Feather name="list" size={16} color={c.primary} />}
            onPress={() => router.replace("/(tabs)/bookings")}
          />
        </View>

        {booking.status === "cancelled" ? (
          <Card style={{ marginTop: 14 }}>
            <View style={styles.cancelInfoHead}>
              <Feather name="x-circle" size={18} color={c.destructive} />
              <Text style={[styles.cancelInfoTitle, { color: c.foreground }]}>
                {cancelledByLabel ?? t("cancelBookingTitle")}
              </Text>
            </View>
            {booking.cancellationReason ? (
              <Text style={[styles.cancelInfoBody, { color: c.foreground }]}>
                {booking.cancellationReason}
              </Text>
            ) : null}
            <RefundBadge status={booking.refundStatus} />
          </Card>
        ) : null}

        <View
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.muted,
          }}
        >
          <View style={styles.cancelInfoHead}>
            <Feather name="info" size={14} color={c.mutedForeground} />
            <Text
              style={[styles.disclaimerTitle, { color: c.mutedForeground }]}
            >
              {t("platformDisclaimerTitle")}
            </Text>
          </View>
          <Text style={[styles.disclaimerBody, { color: c.mutedForeground }]}>
            {t("platformDisclaimerBody")}
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={cancelOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !cancelling && setCancelOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalContainer}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.modalCard,
                { backgroundColor: c.background, borderRadius: c.radius },
              ]}
            >
              <Text style={[styles.modalTitle, { color: c.foreground }]}>
                {t("cancelBookingTitle")}
              </Text>
              <Text
                style={[styles.modalDesc, { color: c.mutedForeground }]}
              >
                {t("cancelBookingPrompt")}
              </Text>
              {booking.depositPaidAt && refundPreview != null ? (
                <View
                  style={{
                    marginBottom: 14,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: c.muted,
                  }}
                >
                  <View style={styles.row}>
                    <Text
                      style={[styles.payLabel, { color: c.mutedForeground }]}
                    >
                      {t("refundEstimateLabel")}
                    </Text>
                    <Text
                      style={[
                        styles.payValue,
                        {
                          color: refundPreview > 0 ? c.primary : c.destructive,
                        },
                      ]}
                    >
                      {refundPreview > 0
                        ? `${refundPreview.toLocaleString()} ${t("sar")}`
                        : t("refundNotEligible")}
                    </Text>
                  </View>
                  {daysToEvent != null ? (
                    <Text
                      style={{
                        fontFamily: "Cairo_400Regular",
                        fontSize: 11,
                        color: c.mutedForeground,
                        textAlign: "right",
                        marginTop: 6,
                      }}
                    >
                      {t("cancellationCurrentWindow", { days: daysToEvent })}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <Input
                label={t("cancelBookingReasonLabel")}
                placeholder={t("cancelBookingReasonLabel")}
                value={cancelReason}
                onChangeText={setCancelReason}
                multiline
                numberOfLines={3}
                style={{ height: 90, textAlignVertical: "top" }}
                maxLength={400}
              />
              <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("cancelBookingConfirmBtn")}
                    onPress={submitCancel}
                    loading={cancelling}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("cancelBookingKeep")}
                    variant="ghost"
                    onPress={() => !cancelling && setCancelOpen(false)}
                  />
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </View>
  );
}

function RefundBadge({ status }: { status: RefundStatus }) {
  const c = useColors();
  const { t } = useT();
  if (status === "not_required") return null;
  const config: Record<
    Exclude<RefundStatus, "not_required">,
    { label: string; bg: string; fg: string }
  > = {
    pending: { label: t("refundStatusPending"), bg: "#fef3c7", fg: "#a16207" },
    completed: {
      label: t("refundStatusCompleted"),
      bg: "#dcfce7",
      fg: "#166534",
    },
    failed: { label: t("refundStatusFailed"), bg: "#fee2e2", fg: c.destructive },
  };
  const { label, bg, fg } = config[status as Exclude<RefundStatus, "not_required">];
  return (
    <View
      style={{
        marginTop: 10,
        alignSelf: "flex-end",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
        backgroundColor: bg,
      }}
    >
      <Text style={{ color: fg, fontFamily: "Cairo_600SemiBold", fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

function PaymentBadge({ status }: { status: "pending" | "paid" | "refunded" | "failed" }) {
  const c = useColors();
  const { t } = useT();
  const config = {
    pending: { label: t("paymentStatusPendingShort"), bg: "#fef3c7", fg: "#a16207" },
    paid: { label: t("paymentStatusPaid"), bg: "#dcfce7", fg: "#16a34a" },
    refunded: { label: t("paymentStatusRefunded"), bg: "#dbeafe", fg: "#2563eb" },
    failed: { label: t("paymentStatusFailed"), bg: "#fee2e2", fg: c.destructive },
  }[status];
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
        backgroundColor: config.bg,
      }}
    >
      <Text style={{ color: config.fg, fontFamily: "Cairo_600SemiBold", fontSize: 11 }}>
        {config.label}
      </Text>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  const c = useColors();
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIcon, { backgroundColor: c.primaryBg }]}>
        <Feather name={icon} size={16} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.detailLabel, { color: c.mutedForeground }]}>
          {label}
        </Text>
        <Text style={[styles.detailValue, { color: c.foreground }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function LocationRow({ location }: { location: string }) {
  const c = useColors();
  const { t } = useT();
  const parsed = parseLocation(location);
  const hasMap = parsed.mapUrl && isMapUrl(parsed.mapUrl);
  const openMap = () => {
    if (parsed.mapUrl) Linking.openURL(parsed.mapUrl).catch(() => {});
  };
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIcon, { backgroundColor: c.primaryBg }]}>
        <Feather name="map-pin" size={16} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.detailLabel, { color: c.mutedForeground }]}>
          {t("location")}
        </Text>
        <Text style={[styles.detailValue, { color: c.foreground }]}>
          {parsed.city || parsed.raw}
        </Text>
        {hasMap ? (
          <Pressable
            onPress={openMap}
            style={({ pressed }) => [
              styles.openMapBtn,
              {
                backgroundColor: c.primaryBg,
                borderColor: c.primary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="external-link" size={13} color={c.primary} />
            <Text style={[styles.openMapText, { color: c.primary }]}>
              {t("openInMaps")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", height: 140 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  providerName: { fontFamily: "Cairo_700Bold", fontSize: 17, flex: 1, textAlign: "right" },
  serviceTitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    marginTop: 6,
    textAlign: "right",
  },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right" },
  detailRow: { flexDirection: "row-reverse", gap: 12, alignItems: "center" },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginBottom: 2,
    textAlign: "right",
  },
  detailValue: {
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    textAlign: "right",
  },
  payLabel: { fontFamily: "Cairo_400Regular", fontSize: 14 },
  payValue: { fontFamily: "Cairo_500Medium", fontSize: 14 },
  divider: { height: 1 },
  totalLabel: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  totalValue: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  reviewText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
  },
  openMapBtn: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  openMapText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  cancelInfoHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  cancelInfoTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  cancelInfoBody: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
  },
  policyLine: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 20,
  },
  policyHighlight: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    textAlign: "right",
  },
  disclaimerTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    textAlign: "right",
  },
  disclaimerBody: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    textAlign: "right",
    lineHeight: 19,
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
  },
  modalContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    padding: 20,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
    marginBottom: 6,
  },
  modalDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
    marginBottom: 14,
  },
});
