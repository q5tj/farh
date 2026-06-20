import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { COVER_BY_CATEGORY, DEFAULT_COVER } from "@/constants/seedData";
import { Booking, useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function BookingItem({ booking }: { booking: Booking }) {
  const c = useColors();
  const { t } = useT();
  const { getProvider } = useApp();
  const provider = getProvider(booking.providerId);

  const cover = provider?.coverUrl
    ? { uri: provider.coverUrl }
    : COVER_BY_CATEGORY[provider?.categorySlug ?? ""] ?? DEFAULT_COVER;

  const title = provider?.name ?? booking.serviceTitle;

  return (
    <Pressable
      onPress={() => router.push(`/booking/${booking.id}`)}
      style={({ pressed }) => [
        styles.wrap,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderRadius: 18,
          opacity: pressed ? 0.93 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        },
      ]}
    >
      <View style={styles.row}>
        <Image source={cover} style={styles.image} />
        <View style={styles.content}>
          <View style={styles.headRow}>
            <Text
              style={[styles.title, { color: c.foreground }]}
              numberOfLines={1}
            >
              {title}
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
            <View style={[styles.metaItem, { backgroundColor: c.muted }]}>
              <Feather name="calendar" size={11} color={c.mutedForeground} />
              <Text style={[styles.meta, { color: c.foreground }]}>
                {booking.date}
              </Text>
            </View>
            <View style={[styles.metaItem, { backgroundColor: c.muted }]}>
              <Feather name="clock" size={11} color={c.mutedForeground} />
              <Text style={[styles.meta, { color: c.foreground }]}>
                {booking.time}
              </Text>
            </View>
          </View>
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: c.mutedForeground }]}>
              {t("priceLabel")}
            </Text>
            <Text style={[styles.price, { color: c.primary }]}>
              {booking.price.toLocaleString()} {t("sar")}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  row: { flexDirection: "row-reverse", gap: 12 },
  image: { width: 92, height: 92, borderRadius: 14 },
  content: { flex: 1, gap: 6 },
  headRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15, flex: 1, textAlign: "right" },
  service: { fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: "right" },
  metaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  meta: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  priceRow: {
    flexDirection: "row-reverse",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 6,
  },
  priceLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
  },
  price: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
  },
});
