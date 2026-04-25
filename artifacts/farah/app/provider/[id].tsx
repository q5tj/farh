import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Stars } from "@/components/ui/Stars";
import { COVER_BY_CATEGORY } from "@/constants/seedData";
import { STRINGS } from "@/constants/strings";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

export default function ProviderScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getProvider, getCategory, bookings } = useApp();
  const provider = getProvider(String(id));
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    provider?.services[0]?.id ?? null,
  );

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
        <Text style={{ color: c.foreground }}>مزود غير موجود</Text>
      </View>
    );
  }

  const category = getCategory(provider.categoryId);
  const cover = COVER_BY_CATEGORY[provider.categoryId];
  const galleryImages = provider.gallery.map((g) => COVER_BY_CATEGORY[g] ?? cover);

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
        <View style={styles.heroWrap}>
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
              onPress={() => router.back()}
              style={styles.iconBtn}
            >
              <Feather name="chevron-right" size={22} color="#ffffff" />
            </Pressable>
            <Pressable style={styles.iconBtn}>
              <Feather name="share-2" size={20} color="#ffffff" />
            </Pressable>
          </View>
          <View style={styles.heroContent}>
            <View style={styles.catPill}>
              <Text style={styles.catPillText}>{category?.name}</Text>
            </View>
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
              {STRINGS.about}
            </Text>
            <Text
              style={[
                styles.aboutText,
                { color: c.mutedForeground, marginTop: 8 },
              ]}
            >
              {provider.description}
            </Text>
          </Card>

          <View style={{ marginTop: 14 }}>
            <Text
              style={[styles.sectionTitle, { color: c.foreground, marginBottom: 10 }]}
            >
              {STRINGS.galleryTitle}
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
              {STRINGS.servicesAndPrices}
            </Text>
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
                          {s.duration}
                        </Text>
                      </View>
                      <Text style={[styles.servicePrice, { color: c.primary }]}>
                        {s.price.toLocaleString()} {STRINGS.sar}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ marginTop: 18 }}>
            <Text
              style={[styles.sectionTitle, { color: c.foreground, marginBottom: 10 }]}
            >
              {STRINGS.reviewsTitle}
            </Text>
            {reviews.length === 0 ? (
              <Card>
                <Text style={[styles.noReviews, { color: c.mutedForeground }]}>
                  لا توجد تقييمات بعد. كن أول من يقيّم بعد إنهاء الخدمة.
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
        <Pressable
          onPress={() => Linking.openURL(`tel:${provider.phone}`)}
          style={[
            styles.callBtn,
            { borderColor: c.primary, borderRadius: c.radius },
          ]}
        >
          <Feather name="phone" size={20} color={c.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Button label={STRINGS.bookNow} onPress={goBook} size="lg" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrap: { width: "100%", height: 320, position: "relative" },
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
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  heroTitle: {
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
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
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  body: { padding: 16 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
  aboutText: {
    fontFamily: "Inter_400Regular",
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
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    textAlign: "right",
  },
  serviceDur: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 3,
    textAlign: "right",
  },
  servicePrice: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  noReviews: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "right",
  },
  reviewHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewer: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  reviewText: {
    fontFamily: "Inter_400Regular",
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
