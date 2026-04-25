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
import { STRINGS } from "@/constants/strings";
import { BookingStatus, useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

const FILTERS: { id: "all" | BookingStatus; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "pending", label: STRINGS.statusPending },
  { id: "accepted", label: STRINGS.statusAccepted },
  { id: "completed", label: STRINGS.statusCompleted },
  { id: "rejected", label: STRINGS.statusRejected },
];

export default function BookingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { bookings } = useApp();
  const [filter, setFilter] = useState<"all" | BookingStatus>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return bookings;
    return bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={STRINGS.myBookings} showBack={false} />

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
          title={STRINGS.noBookings}
          description={STRINGS.noBookingsDesc}
          cta={{
            label: STRINGS.exploreNow,
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
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row-reverse",
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
