import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { COVER_BY_CATEGORY } from "@/constants/seedData";
import { STRINGS } from "@/constants/strings";
import { useColors } from "@/hooks/useColors";
import { Stars } from "@/components/ui/Stars";

interface Props {
  provider: {
    id: string;
    name: string;
    city: string;
    rating: number;
    reviews: number;
    priceFrom: number;
    cover: string;
    categoryId: string;
  };
  variant?: "wide" | "horizontal";
}

export function ProviderCard({ provider, variant = "wide" }: Props) {
  const c = useColors();
  const cover = COVER_BY_CATEGORY[provider.categoryId];

  if (variant === "horizontal") {
    return (
      <Pressable
        onPress={() => router.push(`/provider/${provider.id}`)}
        style={({ pressed }) => [
          styles.hCard,
          {
            backgroundColor: c.card,
            borderColor: c.border,
            borderRadius: c.radius,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Image source={cover} style={styles.hImage} />
        <View style={styles.hContent}>
          <Text style={[styles.title, { color: c.foreground }]} numberOfLines={1}>
            {provider.name}
          </Text>
          <View style={styles.cityRow}>
            <Feather name="map-pin" size={12} color={c.mutedForeground} />
            <Text style={[styles.city, { color: c.mutedForeground }]}>
              {provider.city}
            </Text>
          </View>
          <View style={styles.bottomRow}>
            <View style={styles.ratingRow}>
              <Stars value={provider.rating} size={12} />
              <Text style={[styles.ratingText, { color: c.foreground }]}>
                {provider.rating.toFixed(1)}
              </Text>
            </View>
            <Text style={[styles.price, { color: c.primary }]}>
              {STRINGS.startingFrom} {provider.priceFrom.toLocaleString()} {STRINGS.sar}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(`/provider/${provider.id}`)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderRadius: c.radius,
          opacity: pressed ? 0.95 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
          ...(Platform.OS === "web"
            ? ({ boxShadow: "0 4px 14px rgba(123,44,191,0.08)" } as object)
            : {
                shadowColor: "#7b2cbf",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.08,
                shadowRadius: 12,
                elevation: 3,
              }),
        },
      ]}
    >
      <Image source={cover} style={styles.image} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: c.foreground }]} numberOfLines={1}>
          {provider.name}
        </Text>
        <View style={styles.cityRow}>
          <Feather name="map-pin" size={12} color={c.mutedForeground} />
          <Text style={[styles.city, { color: c.mutedForeground }]}>
            {provider.city}
          </Text>
          <View style={[styles.dot, { backgroundColor: c.mutedForeground }]} />
          <Text style={[styles.city, { color: c.mutedForeground }]}>
            {provider.reviews} تقييم
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <View style={styles.ratingRow}>
            <Stars value={provider.rating} size={14} />
            <Text style={[styles.ratingText, { color: c.foreground }]}>
              {provider.rating.toFixed(1)}
            </Text>
          </View>
          <Text style={[styles.price, { color: c.primary }]}>
            {STRINGS.startingFrom} {provider.priceFrom.toLocaleString()} {STRINGS.sar}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderWidth: 1,
    overflow: "hidden",
  },
  image: { width: "100%", height: 160 },
  content: { padding: 14, gap: 8 },

  hCard: {
    width: 260,
    borderWidth: 1,
    overflow: "hidden",
    marginRight: 12,
  },
  hImage: { width: "100%", height: 130 },
  hContent: { padding: 12, gap: 6 },

  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    textAlign: "right",
  },
  cityRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
  },
  city: { fontFamily: "Inter_400Regular", fontSize: 12 },
  dot: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 4 },
  bottomRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  ratingText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  price: { fontFamily: "Inter_700Bold", fontSize: 13 },
});
