import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookingItem } from "@/components/BookingItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { BookingItemSkeleton } from "@/components/ui/Skeleton";
import { BookingStatus, useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useT } from "@/lib/i18n";

export default function BookingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { bookings, loading } = useApp();
  const { t, isRtl } = useT();
  const [filter, setFilter] = useState<"all" | BookingStatus>("all");
  // Bookings tab is account-only. Apple guideline 5.1.1(v) lets us keep
  // it gated because it's directly tied to having a user account.
  const ready = useRequireAuth();

  const FILTERS = useMemo<
    { id: "all" | BookingStatus; label: string }[]
  >(
    () => [
      { id: "all", label: t("all") },
      { id: "pending", label: t("statusPending") },
      { id: "accepted", label: t("statusAccepted") },
      { id: "completed", label: t("statusCompleted") },
      { id: "rejected", label: t("statusRejected") },
    ],
    [t],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return bookings;
    return bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const flexDir = isRtl ? ("row-reverse" as const) : ("row" as const);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: c.background }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("myBookings")} onBack={onBack} />

      <View
        style={[
          styles.filterRow,
          { flexDirection: isRtl ? "row-reverse" : "row" },
        ]}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? c.primary : c.muted,
                  borderRadius: 100,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#ffffff" : c.foreground },
                ]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && bookings.length === 0 ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: isWeb ? 110 : insets.bottom + 90,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <BookingItemSkeleton key={i} />
          ))}
        </ScrollView>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={t("noBookings")}
          description={t("noBookingsDesc")}
          cta={{
            label: t("exploreNow"),
            onPress: () => router.push("/(tabs)"),
          }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: isWeb ? 110 : insets.bottom + 90,
          }}
        >
          {filtered.map((b) => (
            <BookingItem key={b.id} booking={b} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 100,
    gap: 6,
  },
  backText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});
