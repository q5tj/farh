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
import { BookingStatus, useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

export default function BookingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { bookings } = useApp();
  const { t, isRtl } = useT();
  const [filter, setFilter] = useState<"all" | BookingStatus>("all");

  const FILTERS = useMemo(() => {
    const list: { id: "all" | BookingStatus; label: string }[] = [
      { id: "all", label: t("all") },
      { id: "pending", label: t("statusPending") },
      { id: "accepted", label: t("statusAccepted") },
      { id: "completed", label: t("statusCompleted") },
      { id: "rejected", label: t("statusRejected") },
    ];
    // On RTL we render in natural row order but reverse the array so the
    // first item still appears on the right (Arabic reading direction).
    // `flexDirection: row-reverse` inside a horizontal ScrollView breaks
    // on native — items get hidden behind the start edge. Reversing the
    // data array sidesteps that quirk and works identically on web/iOS/Android.
    return isRtl ? [...list].reverse() : list;
  }, [t, isRtl]);

  const filtered = useMemo(() => {
    if (filter === "all") return bookings;
    return bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const flexDir = isRtl ? ("row-reverse" as const) : ("row" as const);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("myBookings")} onBack={onBack} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 60 }}
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
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
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
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
  },
});
