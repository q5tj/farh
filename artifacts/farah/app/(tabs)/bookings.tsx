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

      {/*
        Tabs row — fixed 5 segments, NO horizontal ScrollView. We tried a
        ScrollView previously but RN-web miscalculates child positions
        when chip backgrounds change on press: the inner flex layout
        recomputes and chips collapse on top of the active one. A plain
        View with flex:1 per tab + bottom underline is simpler and
        completely deterministic.

        We reverse the FILTERS array on RTL so the visual order matches
        the typed order (الكل أولاً على اليمين). Each Pressable wraps an
        inner View so we can render the count badge inline reliably.
      */}
      <View
        style={[
          styles.tabsRow,
          { borderBottomColor: c.border, flexDirection: flexDir },
        ]}
      >
        {(isRtl ? [...FILTERS].reverse() : FILTERS).map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={({ pressed }) => [
                styles.tabBtn,
                {
                  opacity: pressed ? 0.7 : 1,
                  borderBottomColor: active ? c.primary : "transparent",
                },
              ]}
            >
              <View style={[styles.tabContent, { flexDirection: flexDir }]}>
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: active ? c.primary : c.mutedForeground,
                      fontFamily: active
                        ? "Cairo_700Bold"
                        : "Cairo_600SemiBold",
                    },
                  ]}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {f.label}
                </Text>
                {f.count > 0 ? (
                  <View
                    style={[
                      styles.tabBadge,
                      {
                        backgroundColor: active ? c.primary : c.muted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabBadgeText,
                        { color: active ? "#ffffff" : c.foreground },
                      ]}
                      allowFontScaling={false}
                    >
                      {f.count}
                    </Text>
                  </View>
                ) : null}
              </View>
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
  tabsRow: {
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 17,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    lineHeight: 13,
    includeFontPadding: false,
  },
});
