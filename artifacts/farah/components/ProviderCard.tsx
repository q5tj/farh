import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { COVER_BY_CATEGORY, DEFAULT_COVER } from "@/constants/seedData";
import { useApp } from "@/contexts/AppContext";
import { Provider } from "@/lib/data";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";
import { Stars } from "@/components/ui/Stars";

interface Props {
  provider: Provider;
  variant?: "wide" | "horizontal";
}

function pickCover(provider: Provider) {
  if (provider.coverUrl) return { uri: provider.coverUrl };
  return COVER_BY_CATEGORY[provider.categorySlug] ?? DEFAULT_COVER;
}

export function ProviderCard({ provider, variant = "wide" }: Props) {
  const c = useColors();
  const { t } = useT();
  const { isFavorite, toggleFavorite } = useApp();
  const fav = isFavorite(provider.id);
  const cover = pickCover(provider);

  const onToggleFav = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    toggleFavorite(provider.id).catch(() => {});
  };

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
        <View>
          <Image source={cover} style={styles.hImage} />
          <Pressable
            onPress={onToggleFav}
            hitSlop={10}
            style={[styles.heartBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
          >
            <Feather
              name="heart"
              size={16}
              color={fav ? "#dc2626" : c.mutedForeground}
              style={fav ? { } : undefined}
            />
          </Pressable>
        </View>
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
              {t("startingFrom")} {provider.priceFrom.toLocaleString()} {t("sar")}
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
        },
      ]}
    >
      <View>
        <Image source={cover} style={styles.image} />
        <Pressable
          onPress={onToggleFav}
          hitSlop={10}
          style={[styles.heartBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
        >
          <Feather
            name="heart"
            size={18}
            color={fav ? "#dc2626" : c.mutedForeground}
          />
        </Pressable>
      </View>
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
            {t("reviewsCount", { count: provider.reviews })}
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
            {t("startingFrom")} {provider.priceFrom.toLocaleString()} {t("sar")}
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
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    textAlign: "right",
  },
  cityRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
  },
  city: { fontFamily: "Cairo_400Regular", fontSize: 12 },
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
  ratingText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  price: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  heartBtn: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
