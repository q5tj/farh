import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  fetchOwnProviderStatement,
  type Booking,
  type CommissionStatus,
  type ProviderFinancialSummary,
} from "@/lib/data";
import { infoDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import {
  createMoyasarInvoice,
  fetchPendingProviderCommissions,
  fetchProviderWalletBreakdown,
  MOYASAR_ERROR_CODES,
  type PaymentRow,
  type ProviderWalletBreakdown,
} from "@/lib/payments";

export default function ProviderFinancialsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";
  const providerId = profile?.providerId ?? null;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [summary, setSummary] = useState<ProviderFinancialSummary | null>(null);
  const [wallet, setWallet] = useState<ProviderWalletBreakdown | null>(null);
  const [pendingCommissions, setPendingCommissions] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = async () => {
    if (!providerId) return;
    try {
      const [statement, walletBreakdown, owed] = await Promise.all([
        fetchOwnProviderStatement(providerId, lang),
        fetchProviderWalletBreakdown(providerId).catch(() => null),
        fetchPendingProviderCommissions(providerId).catch(() => []),
      ]);
      setBookings(statement.bookings);
      setSummary(statement.summary);
      setWallet(walletBreakdown);
      setPendingCommissions(owed);
    } catch (e) {
      console.warn("[provider financials] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const payCommission = async (row: PaymentRow) => {
    setPayingId(row.id);
    try {
      const webOrigin =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin
          : "https://farhatukum.com";
      const callbackUrl = `${webOrigin}/payment/return?payment_id=${row.id}&booking_id=${row.bookingId}`;
      const { invoice_url } = await createMoyasarInvoice(row.id, callbackUrl);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = invoice_url;
        return;
      }
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
    } catch (e) {
      const raw = (e as Error)?.message;
      const msg =
        raw === MOYASAR_ERROR_CODES.providerNotConnected
          ? t("paymentProviderNotConnected")
          : raw === MOYASAR_ERROR_CODES.providerKeysUnverified
            ? t("paymentProviderKeysUnverified")
            : t("completionFailed");
      await infoDialog({ title: t("error"), message: msg });
    } finally {
      setPayingId(null);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, lang]);

  if (!providerId) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader
          title={t("providerFinancials")}
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/provider-zone");
          }}
        />
        <EmptyState icon="alert-circle" title={t("createProviderFirst")} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("providerFinancials")}
        subtitle={t("providerFinancialsDesc")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/provider-zone");
        }}
      />
      {loading ? (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 12,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={c.primary}
            />
          }
        >
          <View
            style={[
              styles.holdNotice,
              { borderColor: c.border, backgroundColor: c.muted },
            ]}
          >
            <Feather name="info" size={14} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.holdTitle, { color: c.foreground }]}>
                {t("walletHeldNoticeTitle")}
              </Text>
              <Text
                style={[styles.holdBody, { color: c.mutedForeground }]}
              >
                {t("walletHeldNoticeBody")}
              </Text>
            </View>
          </View>

          {wallet ? (
            <View
              style={[
                styles.walletCard,
                {
                  backgroundColor: c.card,
                  borderRadius: c.radius,
                  borderColor: c.border,
                },
              ]}
            >
              <Text style={[styles.walletTitle, { color: c.foreground }]}>
                {t("walletTitle")}
              </Text>
              <View style={styles.walletAvailableRow}>
                <Text
                  style={[styles.walletAvailLabel, { color: c.mutedForeground }]}
                >
                  {t("walletAvailable")}
                </Text>
                <Text
                  style={[styles.walletAvailValue, { color: c.primary }]}
                >
                  {wallet.availableSar.toLocaleString()} {t("sar")}
                </Text>
              </View>
              <View style={styles.walletMetaRow}>
                <Text style={[styles.walletMeta, { color: c.mutedForeground }]}>
                  {t("walletReleased")}: {wallet.releasedSar.toLocaleString()}{" "}
                  {t("sar")}
                </Text>
                <Text style={[styles.walletMeta, { color: c.mutedForeground }]}>
                  {t("walletPaidOut")}: {wallet.paidOutSar.toLocaleString()}{" "}
                  {t("sar")}
                </Text>
              </View>

              {wallet.pendingCommissionSar > 0 ? (
                <View
                  style={[
                    styles.commissionWarning,
                    { backgroundColor: "#fef3c7", borderColor: "#fde68a" },
                  ]}
                >
                  <Feather name="alert-triangle" size={14} color="#a16207" />
                  <Text
                    style={[styles.commissionWarnText, { color: "#a16207" }]}
                  >
                    {t("commissionSettlementWarning", {
                      amount: wallet.pendingCommissionSar.toLocaleString(),
                    })}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {pendingCommissions.length > 0 ? (
            <View
              style={[
                styles.walletCard,
                {
                  backgroundColor: c.card,
                  borderRadius: c.radius,
                  borderColor: "#fde68a",
                },
              ]}
            >
              <Text style={[styles.walletTitle, { color: c.foreground }]}>
                {t("commissionDueTitle")}
              </Text>
              <Text
                style={[
                  styles.holdBody,
                  { color: c.mutedForeground, marginBottom: 10 },
                ]}
              >
                {t("commissionDueIntro")}
              </Text>
              {pendingCommissions.map((row) => (
                <View key={row.id} style={styles.commissionRow}>
                  <Text
                    style={[styles.commissionRowLabel, { color: c.foreground }]}
                  >
                    {row.amountSar.toLocaleString()} {t("sar")}
                  </Text>
                  <Pressable
                    disabled={payingId === row.id}
                    onPress={() => payCommission(row)}
                    style={({ pressed }) => [
                      styles.payNowBtn,
                      {
                        backgroundColor: c.primary,
                        opacity: pressed || payingId === row.id ? 0.7 : 1,
                      },
                    ]}
                  >
                    {payingId === row.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.payNowBtnText}>{t("payNow")}</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.statsGrid}>
            <StatCell
              label={t("totalRevenue")}
              value={Math.round(summary?.totalRevenue ?? 0).toLocaleString()}
              tint="#7b2cbf"
            />
            <StatCell
              label={t("totalPaid")}
              value={Math.round(summary?.totalPaid ?? 0).toLocaleString()}
              tint="#16a34a"
            />
            <StatCell
              label={t("totalOwed")}
              value={Math.round(summary?.totalOwed ?? 0).toLocaleString()}
              tint="#dc2626"
              highlight={(summary?.totalOwed ?? 0) > 0}
            />
            <StatCell
              label={t("totalWaived")}
              value={Math.round(summary?.totalWaived ?? 0).toLocaleString()}
              tint="#525252"
            />
          </View>

          {bookings.length === 0 ? (
            <EmptyState icon="inbox" title={t("noFinancialDataYet")} />
          ) : (
            bookings.map((b) => <BookingRow key={b.id} booking={b} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

function StatCell({
  label,
  value,
  tint,
  highlight,
}: {
  label: string;
  value: string;
  tint: string;
  highlight?: boolean;
}) {
  const c = useColors();
  const { t } = useT();
  return (
    <View
      style={[
        styles.statCell,
        {
          backgroundColor: c.card,
          borderColor: highlight ? tint : c.border,
          borderRadius: c.radius,
        },
      ]}
    >
      <Text style={[styles.statLabel, { color: c.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: tint }]} numberOfLines={1}>
        {value}{" "}
        <Text style={[styles.statSar, { color: c.mutedForeground }]}>
          {t("sar")}
        </Text>
      </Text>
    </View>
  );
}

function BookingRow({ booking }: { booking: Booking }) {
  const c = useColors();
  const { t } = useT();

  // Commission status pill — same palette as before.
  const cStatus = booking.commissionStatus;
  const cPalette: Record<
    CommissionStatus,
    { bg: string; fg: string; label: string }
  > = {
    owed: { bg: "#fef3c7", fg: "#a16207", label: t("commissionOwed") },
    paid: { bg: "#dcfce7", fg: "#15803d", label: t("commissionPaid") },
    waived: { bg: "#e5e5e5", fg: "#525252", label: t("commissionWaived") },
  };
  const cp = cPalette[cStatus];

  // Compute the provider-facing breakdown so the row reads like a
  // line in a real statement (instead of just "commission amount: X").
  const deposit = booking.depositAmount ?? 0;
  const remaining = Math.max(0, booking.price - deposit);
  const commission = booking.commissionAmount ?? 0;
  // The provider's net depends on the final-payment method:
  //   • online → both deposit-net AND final-net flow through the
  //     platform; total net = price − commission (auto-payout when
  //     Moyasar Payouts is enabled).
  //   • cash / bank → provider received `remaining` directly from
  //     the customer; only the deposit-net flowed through the
  //     platform and they owe `commission - app_share_from_deposit`.
  //   • not yet decided (still pending/accepted) → show only what
  //     they've earned so far (the deposit net, if paid).
  const method = booking.finalPaymentMethod; // null | 'online' | 'cash' | 'bank_transfer'

  return (
    <Card>
      <View style={styles.bookingRow}>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.bookingTitle, { color: c.foreground }]}
            numberOfLines={1}
          >
            {booking.serviceTitle}
          </Text>
          <Text style={[styles.bookingMeta, { color: c.mutedForeground }]}>
            {booking.date} • {booking.price.toLocaleString()} {t("sar")}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: cp.bg }]}>
          <Text style={[styles.pillText, { color: cp.fg }]}>{cp.label}</Text>
        </View>
      </View>

      <View style={[styles.brkDivider, { backgroundColor: c.border }]} />

      {/* Deposit row — always relevant */}
      <BrkRow
        label={t("brkDepositPaid")}
        value={
          booking.depositPaidAt
            ? `${deposit.toLocaleString()} ${t("sar")}`
            : t("brkPending")
        }
        muted={!booking.depositPaidAt}
      />

      {/* Final payment — branches on method */}
      {method === "online" ? (
        <BrkRow
          label={t("brkFinalOnline")}
          value={
            booking.finalPaymentStatus === "paid"
              ? `${remaining.toLocaleString()} ${t("sar")}`
              : t("brkAwaitingCustomerPayment")
          }
          muted={booking.finalPaymentStatus !== "paid"}
        />
      ) : method === "cash" ? (
        <BrkRow
          label={t("brkFinalCash")}
          value={`${remaining.toLocaleString()} ${t("sar")}`}
          accent
        />
      ) : method === "bank_transfer" ? (
        <BrkRow
          label={t("brkFinalBank")}
          value={`${remaining.toLocaleString()} ${t("sar")}`}
          accent
        />
      ) : booking.status === "completed" ? (
        <BrkRow
          label={t("brkFinalNotChosen")}
          value="—"
          muted
        />
      ) : null}

      {/* Commission line — what platform takes */}
      <BrkRow
        label={t("brkCommissionTaken")}
        value={`${Math.round(commission).toLocaleString()} ${t("sar")}`}
        negative
      />

      {/* Bottom-line: net to provider for THIS booking */}
      <View style={[styles.brkDivider, { backgroundColor: c.border }]} />
      <View style={styles.brkBottom}>
        <Text style={[styles.brkBottomLabel, { color: c.foreground }]}>
          {method === "cash" || method === "bank_transfer"
            ? t("brkYouOweUs")
            : t("brkYourNet")}
        </Text>
        <Text style={[styles.brkBottomValue, { color: c.primary }]}>
          {method === "cash" || method === "bank_transfer"
            ? `${Math.round(commission).toLocaleString()} ${t("sar")}`
            : `${Math.max(0, booking.price - commission).toLocaleString()} ${t("sar")}`}
        </Text>
      </View>
    </Card>
  );
}

function BrkRow({
  label,
  value,
  muted,
  negative,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  negative?: boolean;
  accent?: boolean;
}) {
  const c = useColors();
  const valueColor = negative
    ? c.destructive
    : muted
      ? c.mutedForeground
      : accent
        ? c.primary
        : c.foreground;
  return (
    <View style={styles.brkRow}>
      <Text style={[styles.brkLabel, { color: c.mutedForeground }]}>{label}</Text>
      <Text
        style={[
          styles.brkValue,
          {
            color: valueColor,
            fontFamily: muted ? "Cairo_400Regular" : "Cairo_600SemiBold",
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  statCell: {
    flex: 1,
    minWidth: 140,
    padding: 12,
    borderWidth: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  statLabel: { fontFamily: "Cairo_500Medium", fontSize: 11 },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  statSar: { fontFamily: "Cairo_400Regular", fontSize: 10 },
  bookingRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  bookingTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  bookingMeta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  pillText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  brkDivider: { height: 1, marginVertical: 10 },
  brkRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  brkLabel: { fontFamily: "Cairo_500Medium", fontSize: 12 },
  brkValue: { fontSize: 12 },
  brkBottom: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  brkBottomLabel: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  brkBottomValue: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  holdNotice: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  holdTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    textAlign: "right",
  },
  holdBody: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
    lineHeight: 18,
  },
  walletCard: {
    padding: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  commissionRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#fde68a",
  },
  commissionRowLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
  },
  payNowBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  payNowBtnText: {
    color: "#ffffff",
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
  },
  walletTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
    marginBottom: 10,
  },
  walletAvailableRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  walletAvailLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
  },
  walletAvailValue: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
  },
  walletMetaRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 8,
  },
  walletMeta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
  },
  commissionWarning: {
    marginTop: 12,
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  commissionWarnText: {
    flex: 1,
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
    textAlign: "right",
    lineHeight: 18,
  },
});
