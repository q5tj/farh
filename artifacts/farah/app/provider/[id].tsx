import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Stars } from "@/components/ui/Stars";
import { COVER_BY_CATEGORY, DEFAULT_COVER } from "@/constants/seedData";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { fetchProviderById, type Provider } from "@/lib/data";
import { useT } from "@/lib/i18n";

export default function ProviderScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const isWeb = Platform.OS === "web";
  const { height: vh } = useWindowDimensions();
  // Adapt the hero image to the viewport: 32% of viewport height, clamped 220-320.
  const heroHeight = Math.min(320, Math.max(220, Math.round(vh * 0.32)));
  const { id } = useLocalSearchParams<{ id: string }>();
  const providerId = String(id);
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";
  const { getProvider, getCategoryById, bookings } = useApp();

  // Try cached first; if not loaded yet (deep link), fetch directly.
  const cached = getProvider(providerId);
  const [provider, setProvider] = useState<Provider | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) {
      setProvider(cached);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchProviderById(providerId, lang)
      .then((p) => {
        if (alive) setProvider(p);
      })
      .catch(() => {
        if (alive) setProvider(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [providerId, lang, cached]);

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  useEffect(() => {
    if (provider && !selectedServiceId && provider.services.length > 0) {
      setSelectedServiceId(provider.services[0].id);
    }
  }, [provider, selectedServiceId]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!provider) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: c.foreground }}>{t("providerNotFound")}</Text>
      </View>
    );
  }

  const category = getCategoryById(provider.categoryId);
  const fallbackCover =
    COVER_BY_CATEGORY[provider.categorySlug] ?? DEFAULT_COVER;
  const cover = provider.coverUrl
    ? { uri: provider.coverUrl }
    : fallbackCover;

  const galleryImages =
    provider.gallery.length > 0
      ? provider.gallery.map((url) => ({ uri: url }))
      : [fallbackCover];

  const reviews = bookings.filter(
    (b) => b.providerId === provider.id && b.rating != null,
  );

  const goBook = () => {
    if (!selectedServiceId) return;
    router.push({
      pathname: "/booking-form",
      params: { providerId: provider.id, serviceId: selectedServiceId },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroWrap, { height: heroHeight }]}>
          <Image source={cover} style={styles.heroImage} />
          <LinearGradient
            colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0)", "rgba(26,11,46,0.6)"]}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.heroTop,
              { paddingTop: (isWeb ? Math.max(insets.top, 30) : insets.top) + 8 },
            ]}
          >
            <Pressable onPress={() => router.back()} style={styles.iconBtn}>
              <Feather name="chevron-right" size={22} color="#ffffff" />
            </Pressable>
            <Pressable style={styles.iconBtn}>
              <Feather name="share-2" size={20} color="#ffffff" />
            </Pressable>
          </View>
          <View style={styles.heroContent}>
            {category ? (
              <View style={styles.catPill}>
                <Text style={styles.catPillText}>{category.name}</Text>
              </View>
            ) : null}
            <Text style={styles.heroTitle}>{provider.name}</Text>
            <View style={styles.heroMeta}>
              <View style={styles.metaItem}>
                <Feather name="map-pin" size={13} color="#ffffff" />
                <Text style={styles.metaText}>{provider.city}</Text>
              </View>
              <View style={styles.metaItem}>
                <Stars value={provider.rating} size={13} color="#fbbf24" />
                <Text style={styles.metaText}>
                  {provider.rating.toFixed(1)} ({provider.reviews})
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Card>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              {t("about")}
            </Text>
            <Text
              style={[
                styles.aboutText,
                { color: c.mutedForeground, marginTop: 8 },
              ]}
            >
              {provider.description || "—"}
            </Text>
          </Card>

          <View style={{ marginTop: 14 }}>
            <Text
              style={[styles.sectionTitle, { color: c.foreground, marginBottom: 10 }]}
            >
              {t("galleryTitle")}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              {galleryImages.map((g, i) => (
                <Image key={i} source={g} style={styles.galleryImage} />
              ))}
            </ScrollView>
          </View>

          <View style={{ marginTop: 18 }}>
            <Text
              style={[styles.sectionTitle, { color: c.foreground, marginBottom: 10 }]}
            >
              {t("servicesAndPrices")}
            </Text>
            {provider.services.length === 0 ? (
              <Card>
                <Text style={[styles.noReviews, { color: c.mutedForeground }]}>
                  {t("noServicesByProvider")}
                </Text>
              </Card>
            ) : (
              <View style={{ gap: 10 }}>
                {provider.services.map((s) => {
                  const active = selectedServiceId === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setSelectedServiceId(s.id)}
                      style={[
                        styles.serviceCard,
                        {
                          backgroundColor: active ? c.primaryBg : c.card,
                          borderColor: active ? c.primary : c.border,
                          borderRadius: c.radius,
                        },
                      ]}
                    >
                      <View style={styles.serviceRow}>
                        <View
                          style={[
                            styles.radio,
                            {
                              borderColor: active ? c.primary : c.border,
                              backgroundColor: active ? c.primary : "transparent",
                            },
                          ]}
                        >
                          {active ? (
                            <Feather name="check" size={12} color="#ffffff" />
                          ) : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.serviceTitle,
                              { color: c.foreground },
                            ]}
                          >
                            {s.title}
                          </Text>
                          <Text
                            style={[
                              styles.serviceDur,
                              { color: c.mutedForeground },
                            ]}
                          >
                            {s.duration || "—"}
                          </Text>
                        </View>
                        <Text style={[styles.servicePrice, { color: c.primary }]}>
                          {s.price.toLocaleString()} {t("sar")}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={{ marginTop: 18 }}>
            <Text
              style={[styles.sectionTitle, { color: c.foreground, marginBottom: 10 }]}
            >
              {t("reviewsTitle")}
            </Text>
            {reviews.length === 0 ? (
              <Card>
                <Text style={[styles.noReviews, { color: c.mutedForeground }]}>
                  {t("noReviewsYet")}
                </Text>
              </Card>
            ) : (
              <View style={{ gap: 10 }}>
                {reviews.slice(0, 5).map((r) => (
                  <Card key={r.id}>
                    <View style={styles.reviewHead}>
                      <Stars value={r.rating ?? 0} size={13} />
                      <Text style={[styles.reviewer, { color: c.foreground }]}>
                        {r.userName}
                      </Text>
                    </View>
                    {r.reviewText ? (
                      <Text
                        style={[
                          styles.reviewText,
                          { color: c.mutedForeground, marginTop: 6 },
                        ]}
                      >
                        {r.reviewText}
                      </Text>
                    ) : null}
                  </Card>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: c.background,
            borderTopColor: c.border,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        {provider.phone ? (
          <Pressable
            onPress={() => Linking.openURL(`tel:${provider.phone}`)}
            style={[
              styles.callBtn,
              { borderColor: c.primary, borderRadius: c.radius },
            ]}
          >
            <Feather name="phone" size={20} color={c.primary} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button
            label={t("bookNow")}
            onPress={goBook}
            size="lg"
            disabled={!selectedServiceId}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrap: { width: "100%", position: "relative" },
  heroImage: { width: "100%", height: "100%" },
  heroTop: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: {
    position: "absolute",
    bottom: 24,
    right: 16,
    left: 16,
  },
  catPill: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(123,44,191,0.85)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
    marginBottom: 8,
  },
  catPillText: {
    color: "#ffffff",
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  heroTitle: {
    color: "#ffffff",
    fontFamily: "Cairo_700Bold",
    fontSize: 26,
    textAlign: "right",
  },
  heroMeta: {
    flexDirection: "row-reverse",
    gap: 16,
    marginTop: 8,
  },
  metaItem: { flexDirection: "row-reverse", gap: 5, alignItems: "center" },
  metaText: {
    color: "#ffffff",
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
  },
  body: { padding: 16 },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
  aboutText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    lineHeight: 23,
    textAlign: "right",
  },
  galleryImage: {
    width: 200,
    height: 130,
    borderRadius: 14,
  },
  serviceCard: {
    borderWidth: 2,
    padding: 14,
  },
  serviceRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceTitle: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    textAlign: "right",
  },
  serviceDur: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 3,
    textAlign: "right",
  },
  servicePrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
  },
  noReviews: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
  },
  reviewHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewer: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  reviewText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
  },
  footer: {
    position: "absolute",
    right: 0,
    left: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row-reverse",
    gap: 10,
    borderTopWidth: 1,
    alignItems: "center",
  },
  callBtn: {
    width: 50,
    height: 50,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
