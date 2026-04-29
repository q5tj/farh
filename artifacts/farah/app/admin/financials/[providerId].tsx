import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  adminFetchProviderStatement,
  adminSetCommissionStatus,
  fetchProviderById,
  type Booking,
  type CommissionStatus,
  type Provider,
  type ProviderFinancialSummary,
} from "@/lib/data";
import { useT } from "@/lib/i18n";

export default function AdminFinancialsDetailScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";

  const params = useLocalSearchParams<{ providerId: string }>();
  const providerId = String(params.providerId ?? "");

  const [provider, setProvider] = useState<Provider | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [summary, setSummary] = useState<ProviderFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [target, setTarget] = useState<{
    booking: Booking;
    next: CommissionStatus;
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!providerId) return;
    try {
      const [p, statement] = await Promise.all([
        fetchProviderById(providerId, lang),
        adminFetchProviderStatement(providerId, lang),
      ]);
      setProvider(p);
      setBookings(statement.bookings);
      setSummary(statement.summary);
    } catch (e) {
      console.warn("[admin financials detail] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, lang]);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await adminSetCommissionStatus(target.booking.id, target.next, note.trim());
      setTarget(null);
      setNote("");
      await load();
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (Platform.OS !== "web") Alert.alert(t("error"), msg);
      else if (typeof window !== "undefined") window.alert(msg);
    } finally {
      setBusy(false);
    }
  };

  const onSendStatementEmail = () => {
    if (!provider || !summary) return;
    const owedRows = bookings.filter((b) => b.commissionStatus === "owed");
    const subject = t("emailSubjectStatement", { provider: provider.name });
    const intro = t("emailBodyIntro");
    const lines = owedRows
      .map(
        (b) =>
          `• ${b.date} — ${b.serviceTitle} — ${t("commissionAmount")}: ${Math.round(
            b.commissionAmount,
          )} ${t("sar")}`,
      )
      .join("\n");
    const total = `\n\n${t("totalOwed")}: ${Math.round(summary.totalOwed)} ${t(
      "sar",
    )}`;
    const outro = t("emailBodyOutro");
    const body = [intro, "", lines || "—", total, "", outro].join("\n");
    const to = provider.email ?? "";
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    // TODO(moyasar): replace mailto with payment link
    Linking.openURL(url).catch(() => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(url);
      }
    });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader
          title={t("adminFinancials")}
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/admin/financials" as never);
          }}
        />
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      </View>
    );
  }

  if (!provider || !summary) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader
          title={t("adminFinancials")}
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/admin/financials" as never);
          }}
        />
        <EmptyState icon="alert-circle" title={t("providerNotFound")} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("statementForProvider", { provider: provider.name })}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/admin/financials" as never);
        }}
      />
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
        <Card>
          <View style={styles.providerRow}>
            <View
              style={[
                styles.providerLogo,
                { backgroundColor: c.primaryBg },
              ]}
            >
              {provider.logoUrl ? (
                <Image
                  source={{ uri: provider.logoUrl }}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <Feather name="briefcase" size={22} color={c.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: c.foreground }]}>
                {provider.name}
              </Text>
              <Text style={[styles.providerMeta, { color: c.mutedForeground }]}>
                {provider.city || "—"}{" "}
                {provider.phone ? ` • ${provider.phone}` : ""}
                {provider.email ? ` • ${provider.email}` : ""}
              </Text>
            </View>
          </View>
        </Card>

        <View style={styles.statsGrid}>
          <StatCell
            label={t("totalRevenue")}
            value={Math.round(summary.totalRevenue).toLocaleString()}
            tint="#7b2cbf"
          />
          <StatCell
            label={t("totalPaid")}
            value={Math.round(summary.totalPaid).toLocaleString()}
            tint="#16a34a"
          />
          <StatCell
            label={t("totalOwed")}
            value={Math.round(summary.totalOwed).toLocaleString()}
            tint="#dc2626"
            highlight
          />
          <StatCell
            label={t("totalWaived")}
            value={Math.round(summary.totalWaived).toLocaleString()}
            tint="#525252"
          />
        </View>

        <Button
          label={t("sendStatementEmail")}
          icon={<Feather name="mail" size={16} color="#ffffff" />}
          onPress={onSendStatementEmail}
        />

        {summary.totalOwed === 0 && bookings.length === 0 ? (
          <EmptyState icon="check-circle" title={t("noOutstandingBalance")} />
        ) : bookings.length === 0 ? (
          <EmptyState icon="inbox" title={t("noFinancialDataYet")} />
        ) : (
          bookings.map((b) => (
            <BookingCommissionRow
              key={b.id}
              booking={b}
              onPick={(next) => {
                setNote(b.commissionPaymentNote ?? "");
                setTarget({ booking: b, next });
              }}
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={target !== null}
        transparent
        animationType="slide"
        onRequestClose={() => !busy && setTarget(null)}
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
                {target?.next === "paid"
                  ? t("markCommissionPaid")
                  : target?.next === "waived"
                    ? t("markCommissionWaived")
                    : t("markCommissionOwed")}
              </Text>
              <Input
                label={t("paymentNote")}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                style={{ height: 90, textAlignVertical: "top" }}
                maxLength={400}
              />
              <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <Button label={t("confirm")} onPress={submit} loading={busy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("cancel")}
                    variant="ghost"
                    onPress={() => !busy && setTarget(null)}
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

function BookingCommissionRow({
  booking,
  onPick,
}: {
  booking: Booking;
  onPick: (next: CommissionStatus) => void;
}) {
  const c = useColors();
  const { t } = useT();
  const status = booking.commissionStatus;

  const palette: Record<CommissionStatus, { bg: string; fg: string; label: string }> = {
    owed: { bg: "#fef3c7", fg: "#a16207", label: t("commissionOwed") },
    paid: { bg: "#dcfce7", fg: "#15803d", label: t("commissionPaid") },
    waived: { bg: "#e5e5e5", fg: "#525252", label: t("commissionWaived") },
  };
  const p = palette[status];

  return (
    <Card>
      <View style={styles.bookingRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bookingTitle, { color: c.foreground }]} numberOfLines={1}>
            {booking.serviceTitle}
          </Text>
          <Text style={[styles.bookingMeta, { color: c.mutedForeground }]}>
            {booking.date} • {booking.price.toLocaleString()} {t("sar")}
            {" • "}
            {t("commissionAmount")}: {Math.round(booking.commissionAmount)}{" "}
            {t("sar")}
          </Text>
          {booking.commissionPaymentNote ? (
            <Text style={[styles.bookingNote, { color: c.mutedForeground }]}>
              {booking.commissionPaymentNote}
            </Text>
          ) : null}
        </View>
        <View style={[styles.pill, { backgroundColor: p.bg }]}>
          <Text style={[styles.pillText, { color: p.fg }]}>{p.label}</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        {status !== "paid" ? (
          <Pressable
            onPress={() => onPick("paid")}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: c.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="check" size={14} color="#15803d" />
            <Text style={[styles.actionLabel, { color: c.foreground }]}>
              {t("markCommissionPaid")}
            </Text>
          </Pressable>
        ) : null}
        {status !== "waived" ? (
          <Pressable
            onPress={() => onPick("waived")}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: c.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="slash" size={14} color="#525252" />
            <Text style={[styles.actionLabel, { color: c.foreground }]}>
              {t("markCommissionWaived")}
            </Text>
          </Pressable>
        ) : null}
        {status !== "owed" ? (
          <Pressable
            onPress={() => onPick("owed")}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: c.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="rotate-ccw" size={14} color="#a16207" />
            <Text style={[styles.actionLabel, { color: c.foreground }]}>
              {t("markCommissionOwed")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  providerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  providerLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  providerName: { fontFamily: "Cairo_700Bold", fontSize: 16, textAlign: "right" },
  providerMeta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  statsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
  },
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
  bookingNote: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
    fontStyle: "italic",
  },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  pillText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  actionsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 100,
  },
  actionLabel: { fontFamily: "Cairo_500Medium", fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(26,11,46,0.6)" },
  modalContainer: { flexGrow: 1, justifyContent: "center", padding: 16 },
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
    marginBottom: 14,
  },
});
