import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Booking, useApp } from "@/contexts/AppContext";
import { COVER_BY_CATEGORY } from "@/constants/seedData";
import { STRINGS } from "@/constants/strings";
import { useColors } from "@/hooks/useColors";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function BookingItem({ booking }: { booking: Booking }) {
  const c = useColors();
  const { getProvider } = useApp();
  const provider = getProvider(booking.providerId);
  const cover = provider ? COVER_BY_CATEGORY[provider.categoryId] : undefined;

  return (
    <Pressable
      onPress={() => router.push(`/booking/${booking.id}`)}
      style={({ pressed }) => [
        styles.wrap,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderRadius: c.radius,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {cover ? <Image source={cover} style={styles.image} /> : null}
        <View style={styles.content}>
          <View style={styles.headRow}>
            <Text
              style={[styles.title, { color: c.foreground }]}
              numberOfLines={1}
            >
              {provider?.name ?? STRINGS.empty}
            </Text>
            <StatusBadge status={booking.status} />
          </View>
          <Text
            style={[styles.service, { color: c.mutedForeground }]}
            numberOfLines={1}
          >
            {booking.serviceTitle}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Feather name="calendar" size={12} color={c.mutedForeground} />
              <Text style={[styles.meta, { color: c.mutedForeground }]}>
                {booking.date}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Feather name="clock" size={12} color={c.mutedForeground} />
              <Text style={[styles.meta, { color: c.mutedForeground }]}>
                {booking.time}
              </Text>
            </View>
            <Text style={[styles.price, { color: c.primary }]}>
              {booking.price.toLocaleString()} {STRINGS.sar}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, padding: 10, marginBottom: 10 },
  row: { flexDirection: "row-reverse", gap: 12 },
  image: { width: 88, height: 88, borderRadius: 12 },
  content: { flex: 1, gap: 6 },
  headRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14, flex: 1, textAlign: "right" },
  service: { fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: "right" },
  metaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    marginTop: 2,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 11 },
  price: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    marginRight: "auto",
  },
});
