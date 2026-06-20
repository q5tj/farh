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

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length };
    for (const b of bookings) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [bookings]);

  const FILTERS = useMemo<
    { id: "all" | BookingStatus; label: string; count: number }[]
  >(
    () => [
      { id: "all", label: t("all"), count: counts.all ?? 0 },
      { id: "pending", label: t("statusPending"), count: counts.pending ?? 0 },
      {
        id: "accepted",
        label: t("statusAccepted"),
        count: counts.accepted ?? 0,
      },
      {
        id: "completed",
        label: t("statusCompleted"),
        count: counts.completed ?? 0,
      },
      {
        id: "rejected",
        label: t("statusRejected"),
        count: counts.rejected ?? 0,
      },
    ],
    [t, counts],
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
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
              {f.count > 0 ? (
                <View
                  style={[
                    styles.chipBadge,
                    {
                      backgroundColor: active
                        ? "rgba(255,255,255,0.28)"
                        : c.background,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipBadgeText,
                      { color: active ? "#ffffff" : c.foreground },
                    ]}
                    allowFontScaling={false}
                  >
                    {f.count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

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
    paddingVertical: 12,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    height: 38,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: 6,
    // Critical: stop the horizontal ScrollView from collapsing chips —
    // without this, switching from "all" to a narrower track causes
    // RN-web to recompute widths and the label text gets squeezed to 0.
    flexShrink: 0,
  },
  chipText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: "center",
    flexShrink: 0,
  },
  chipBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  chipBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    lineHeight: 14,
    includeFontPadding: false,
  },
});
