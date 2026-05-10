import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useT } from "@/lib/i18n";

export default function ProviderFinancialsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";
  const providerId = profile?.providerId ?? null;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [summary, setSummary] = useState<ProviderFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!providerId) return;
    try {
      const statement = await fetchOwnProviderStatement(providerId, lang);
      setBookings(statement.bookings);
      setSummary(statement.summary);
    } catch (e) {
      console.warn("[provider financials] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
        </View>
        <View style={[styles.pill, { backgroundColor: p.bg }]}>
          <Text style={[styles.pillText, { color: p.fg }]}>{p.label}</Text>
        </View>
      </View>
    </Card>
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
});
