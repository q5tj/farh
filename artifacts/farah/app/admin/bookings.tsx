import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  adminFetchAllBookings,
  type Booking,
  type BookingStatus,
} from "@/lib/data";
import { useT } from "@/lib/i18n";

export default function AdminBookings() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { providers } = useApp();

  // Order chosen so on RTL the most-actionable filter sits on the right.
  const FILTERS: { id: "all" | BookingStatus; label: string }[] = [
    { id: "all", label: t("all") },
    { id: "cancelled", label: t("statusCancelled") },
    { id: "rejected", label: t("statusRejected") },
    { id: "completed", label: t("statusCompleted") },
    { id: "accepted", label: t("statusAccepted") },
    { id: "pending", label: t("statusPending") },
  ];

  const [filter, setFilter] = useState<"all" | BookingStatus>("all");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const list = await adminFetchAllBookings();
      setBookings(list);
    } catch (e) {
      console.warn("[admin bookings] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return bookings;
    return bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("manageBookings")}
        subtitle={t("bookingsCountSubtitle", { count: bookings.length })}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 56 }}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[
                styles.chip,
                { backgroundColor: active ? c.primary : c.muted },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#ffffff" : c.foreground },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState icon="inbox" title={t("noBookingsInCategory")} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 10,
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
          {filtered.map((b) => {
            const provider = providers.find((p) => p.id === b.providerId);
            return (
              <Card key={b.id}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.title, { color: c.foreground }]}
                      numberOfLines={1}
                    >
                      {provider?.name ?? "—"}
                    </Text>
                    <Text
                      style={[styles.service, { color: c.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {b.serviceTitle}
                    </Text>
                  </View>
                  <StatusBadge status={b.status} />
                </View>

                <View style={[styles.divider, { backgroundColor: c.border }]} />

                <View style={styles.metaGrid}>
                  <MetaCell label={t("customerLabel")} value={b.userName} />
                  <MetaCell label={t("customerPhoneLabel")} value={b.userPhone} />
                  <MetaCell label={t("dateLabel")} value={b.date} />
                  <MetaCell label={t("timeLabel")} value={b.time} />
                  <MetaCell
                    label={t("priceLabel")}
                    value={`${b.price.toLocaleString()} ${t("sar")}`}
                  />
                  <MetaCell
                    label={t("paymentLabel")}
                    value={paymentLabel(b.paymentStatus, t)}
                  />
                </View>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={styles.metaCell}>
      <Text style={[styles.metaLabel, { color: c.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[styles.metaValue, { color: c.foreground }]}
        numberOfLines={1}
      >
        {value || "—"}
      </Text>
    </View>
  );
}

type Translator = ReturnType<typeof useT>["t"];

function paymentLabel(
  status: Booking["paymentStatus"],
  t: Translator,
): string {
  switch (status) {
    case "paid":
      return t("paymentPaid");
    case "refunded":
      return t("paymentRefunded");
    case "failed":
      return t("paymentFailed");
    default:
      return t("paymentPending");
  }
}

const styles = StyleSheet.create({
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  loadingWrap: { paddingTop: 60, alignItems: "center" },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  service: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  divider: { height: 1, marginVertical: 12 },
  metaGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 12,
  },
  metaCell: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 130,
  },
  metaLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    textAlign: "right",
  },
  metaValue: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    marginTop: 2,
    textAlign: "right",
  },
});
