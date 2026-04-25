import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookingItem } from "@/components/BookingItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

export default function AdminBookings() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { bookings } = useApp();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="إدارة الطلبات" subtitle={`${bookings.length} طلب`} />
      {bookings.length === 0 ? (
        <EmptyState icon="inbox" title="لا توجد حجوزات بعد" />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
          }}
        >
          {bookings.map((b) => (
            <BookingItem key={b.id} booking={b} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
