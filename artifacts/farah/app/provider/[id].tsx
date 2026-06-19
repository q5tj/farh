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
import {
  fetchProviderById,
  fetchProviderReviews,
  type Provider,
  type ProviderReview,
} from "@/lib/data";
import { formatDurationMinutes } from "@/lib/date-format";
import { useT } from "@/lib/i18n";

export default function ProviderScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const isWeb = Platform.OS === "web";
  const { height: vh } = useWindowDimensions();
  // Adapt the hero image to the viewport: 32% of viewport height, clamped 220-320.
  const heroHeight = Math.min(320, Math.max(220, Math.round(vh * 0.32)));
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const providerId = String(id);
  // `from` is set by whoever pushed us here (ProviderCard, admin, etc.)
  // so the back arrow can return the user to the exact origin even if the
  // navigation stack got reset (e.g. by a Moyasar deep-link round trip).
  const fromPath = typeof from === "string" && from.length > 0 ? from : null;
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";
  const { getProvider, getCategoryById } = useApp();

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
  const [reviews, setReviews] = useState<ProviderReview[]>([]);

  // Fetch ALL reviews for the provider (not just the viewer's bookings).
  // Reviews are looked up by UUID — the `providerId` param may be a slug
  // (pretty URL), so we must wait until the provider row resolves and use
  // its real UUID.
  useEffect(() => {
    if (!provider?.id) return;
    let alive = true;
    fetchProviderReviews(provider.id)
      .then((rs) => {
        if (alive) setReviews(rs);
      })
      .catch((e) => console.warn("[provider] fetch reviews failed", e));
    return () => {
      alive = false;
    };
  }, [provider?.id]);

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

  const goBook = () => {
    if (!selectedServiceId) return;
    router.push({
      pathname: "/booking-form",
      params: {
        // Pretty URL: pass the slug so the address bar reads
        // /booking-form?providerId=elite-events&serviceId=…
        // instead of two raw UUIDs. booking-form resolves either.
        providerId: provider.slug ?? provider.id,
        serviceId: selectedServiceId,
      },
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
            <Pressable
              onPress={() => {
                if (fromPath) {
                  router.replace(fromPath as never);
                } else if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace("/(tabs)");
                }
              }}
              style={styles.iconBtn}
            >
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

          {provider.lat != null && provider.lng != null ? (
            <Pressable
              onPress={() => {
                const url = `https://www.google.com/maps?q=${provider.lat},${provider.lng}`;
                if (Platform.OS === "web") window.open?.(url, "_blank");
                else Linking.openURL(url).catch(() => {});
              }}
              style={[styles.mapLink, { borderColor: c.border, backgroundColor: c.card }]}
            >
              <Feather name="map-pin" size={16} color={c.primary} />
              <Text style={[styles.mapLinkText, { color: c.primary }]}>
                {t("openInMaps")}
              </Text>
            </Pressable>
          ) : null}

          <View style={{ marginTop: 14 }}>
            <Text
              style={[styles.sectionTitle, { color: c.foreground, marginBottom: 10 }]}
            >
              {t("galleryTitle")}
            </Text>
            {provider.galleryItems.length === 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {galleryImages.map((g, i) => (
                  <Image key={i} source={g} style={styles.galleryImage} />
                ))}
              </ScrollView>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {provider.galleryItems.map((item) => {
                  const open = () => {
                    if (Platform.OS === "web") window.open?.(item.url, "_blank");
                    else Linking.openURL(item.url).catch(() => {});
                  };
                  if (item.kind === "image") {
                    return (
                      <Pressable key={item.id} onPress={open}>
                        <Image
                          source={{ uri: item.url }}
                          style={styles.galleryImage}
                        />
                      </Pressable>
                    );
                  }
                  if (item.kind === "video") {
                    return (
                      <Pressable
                        key={item.id}
                        onPress={open}
                        style={styles.galleryVideo}
                      >
                        {item.thumbnailUrl ? (
                          <Image
                            source={{ uri: item.thumbnailUrl }}
                            style={styles.galleryImage}
                          />
                        ) : (
                          <View
                            style={[
                              styles.galleryFallback,
                              { backgroundColor: c.muted },
                            ]}
                          >
                            <Feather name="video" size={28} color={c.primary} />
                          </View>
                        )}
                        <View style={styles.playBadge}>
                          <Feather name="play" size={20} color="#ffffff" />
                        </View>
                      </Pressable>
                    );
                  }
                  // file
                  return (
                    <Pressable
                      key={item.id}
                      onPress={open}
                      style={[
                        styles.galleryFile,
                        { borderColor: c.border, backgroundColor: c.card },
                      ]}
                    >
                      <Feather name="file-text" size={28} color={c.primary} />
                      <Text style={[styles.galleryFileText, { color: c.foreground }]}>
                        {t("galleryItemFile")}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
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
              <View style={{ gap: 12 }}>
                {provider.services.map((s) => {
                  const active = selectedServiceId === s.id;
                  const img = s.images && s.images[0];
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
                      {img ? (
                        <Image
                          source={{ uri: img }}
                          style={styles.serviceImage}
                        />
                      ) : null}
                      <View style={styles.serviceBody}>
                        <View style={styles.serviceHeader}>
                          <View
                            style={[
                              styles.radio,
                              {
                                borderColor: active ? c.primary : c.border,
                                backgroundColor: active
                                  ? c.primary
                                  : "transparent",
                              },
                            ]}
                          >
                            {active ? (
                              <Feather name="check" size={12} color="#ffffff" />
                            ) : null}
                          </View>
                          <Text
                            style={[
                              styles.serviceTitle,
                              { color: c.foreground, flex: 1 },
                            ]}
                          >
                            {s.title}
                          </Text>
                          <Text style={[styles.servicePrice, { color: c.primary }]}>
                            {s.price.toLocaleString()} {t("sar")}
                          </Text>
                        </View>
                        {s.description ? (
                          <Text
                            style={[
                              styles.serviceDescription,
                              { color: c.mutedForeground },
                            ]}
                          >
                            {s.description}
                          </Text>
                        ) : null}
                        {s.durationMinutes > 0 ? (
                          <View style={styles.serviceMetaRow}>
                            <Feather
                              name="clock"
                              size={12}
                              color={c.mutedForeground}
                            />
                            <Text
                              style={[
                                styles.serviceDur,
                                { color: c.mutedForeground },
                              ]}
                            >
                              {formatDurationMinutes(s.durationMinutes, t, lang)}
                            </Text>
                          </View>
                        ) : null}
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
                {reviews.slice(0, 10).map((r) => (
                  <Card key={r.id}>
                    <View style={styles.reviewHead}>
                      <Stars value={r.rating} size={14} />
                      <Text style={[styles.reviewer, { color: c.foreground }]}>
                        {r.reviewerName ?? t("anonymousUser")}
                      </Text>
                    </View>
                    {r.comment ? (
                      <Text
                        style={[
                          styles.reviewText,
                          { color: c.mutedForeground, marginTop: 6 },
                        ]}
                      >
                        {r.comment}
                      </Text>
                    ) : null}
                  </Card>
                ))}
              </View>
            )}
            <Text
              style={{
                fontFamily: "Cairo_400Regular",
                fontSize: 11,
                color: c.mutedForeground,
                textAlign: "right",
                marginTop: 10,
                lineHeight: 18,
              }}
            >
              {t("reviewsAffectVisibilityNotice")}
            </Text>
          </View>

          <View
            style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.muted,
            }}
          >
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <Feather name="info" size={14} color={c.mutedForeground} />
              <Text
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 12,
                  color: c.mutedForeground,
                  textAlign: "right",
                }}
              >
                {t("platformDisclaimerTitle")}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Cairo_400Regular",
                fontSize: 11,
                color: c.mutedForeground,
                textAlign: "right",
                lineHeight: 19,
              }}
            >
              {t("platformDisclaimerBody")}
            </Text>
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
        {/* Provider phone is intentionally hidden on this public listing.
            The customer must book + pay the deposit before they can call;
            the call button surfaces in /booking/[id] once the deposit
            is settled. This protects the provider from spam and keeps
            transactions inside the platform. */}
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
  galleryVideo: {
    width: 200,
    height: 130,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  galleryFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  playBadge: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 40,
    height: 40,
    marginTop: -20,
    marginLeft: -20,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryFile: {
    width: 130,
    height: 130,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  galleryFileText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  mapLink: {
    marginTop: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
  },
  mapLinkText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
  },
  serviceCard: {
    borderWidth: 2,
    overflow: "hidden",
  },
  serviceImage: {
    width: "100%",
    height: 180,
  },
  serviceBody: {
    padding: 14,
  },
  serviceHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
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
    fontSize: 15,
    textAlign: "right",
  },
  serviceDescription: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    marginTop: 8,
    textAlign: "right",
    lineHeight: 21,
  },
  serviceMetaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  serviceDur: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
  },
  servicePrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
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
