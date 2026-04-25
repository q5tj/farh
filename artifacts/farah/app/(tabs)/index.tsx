import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CategoryPill } from "@/components/CategoryPill";
import { ProviderCard } from "@/components/ProviderCard";
import { Input } from "@/components/ui/Input";
import { FEATURED_CATEGORY_IDS } from "@/constants/categories";
import { STRINGS } from "@/constants/strings";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { categories, providers } = useApp();
  const [query, setQuery] = useState("");
  const isWeb = Platform.OS === "web";

  const filtered = useMemo(() => {
    if (!query.trim()) return providers;
    const q = query.trim();
    return providers.filter(
      (p) =>
        p.name.includes(q) ||
        p.city.includes(q) ||
        p.description.includes(q),
    );
  }, [providers, query]);

  const featured = useMemo(
    () => categories.filter((cat) => FEATURED_CATEGORY_IDS.includes(cat.id)),
    [categories],
  );

  const topRated = useMemo(
    () => [...providers].sort((a, b) => b.rating - a.rating).slice(0, 5),
    [providers],
  );

  const topPicks = useMemo(
    () => [...providers].sort((a, b) => b.reviews - a.reviews).slice(0, 3),
    [providers],
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: isWeb ? 110 : insets.bottom + 90,
        }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.hero,
            { paddingTop: (isWeb ? Math.max(insets.top, 30) : insets.top) + 20 },
          ]}
        >
          <View style={styles.greetRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greet}>
                {STRINGS.greeting} {user?.name ? `، ${user.name}` : ""}
              </Text>
              <Text style={styles.tagline}>{STRINGS.tagline}</Text>
            </View>
            <View style={styles.bell}>
              <Pressable onPress={() => router.push("/(tabs)/notifications")}>
                <Feather name="bell" size={20} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Input
              placeholder={STRINGS.searchPlaceholder}
              value={query}
              onChangeText={setQuery}
              rightIcon={<Feather name="search" size={18} color="#7b2cbf" />}
            />
          </View>
        </LinearGradient>

        {query.length === 0 ? (
          <>
            <Section title={STRINGS.featured} icon="grid">
              <View style={styles.catsGrid}>
                {featured.map((cat) => (
                  <CategoryPill key={cat.id} category={cat} />
                ))}
              </View>
            </Section>

            <View style={[styles.banner, { backgroundColor: c.primaryBg }]}>
              <Image
                source={require("../../assets/images/hero-hall.png")}
                style={styles.bannerImage}
              />
              <LinearGradient
                colors={["rgba(123,44,191,0)", "rgba(90,24,154,0.85)"]}
                style={styles.bannerOverlay}
              />
              <View style={styles.bannerContent}>
                <Text style={styles.bannerTitle}>قاعات وقصور فاخرة</Text>
                <Text style={styles.bannerDesc}>اكتشف أرقى أماكن إقامة الحفلات</Text>
                <Pressable
                  onPress={() => router.push("/category/halls")}
                  style={styles.bannerBtn}
                >
                  <Text style={styles.bannerBtnText}>تصفح القاعات</Text>
                  <Feather name="arrow-left" size={14} color="#7b2cbf" />
                </Pressable>
              </View>
            </View>

            <SectionHeader
              title={STRINGS.topRated}
              icon="star"
              color={c.foreground}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScroll}
              style={{ transform: [{ scaleX: -1 }] }}
            >
              <View style={{ flexDirection: "row", transform: [{ scaleX: -1 }] }}>
                {topRated.map((p) => (
                  <View key={p.id} style={{ transform: [{ scaleX: -1 }] }}>
                    <ProviderCard provider={p} variant="horizontal" />
                  </View>
                ))}
              </View>
            </ScrollView>

            <Section title={STRINGS.allCategories} icon="layers">
              <View style={styles.catsGrid}>
                {categories.map((cat) => (
                  <CategoryPill key={cat.id} category={cat} />
                ))}
              </View>
            </Section>

            <SectionHeader title="مختار لك" icon="award" color={c.foreground} />
            <View style={{ paddingHorizontal: 16, gap: 14 }}>
              {topPicks.map((p) => (
                <ProviderCard key={p.id} provider={p} />
              ))}
            </View>
          </>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
            <Text style={[styles.searchTitle, { color: c.foreground }]}>
              نتائج البحث ({filtered.length})
            </Text>
            {filtered.map((p) => (
              <ProviderCard key={p.id} provider={p} />
            ))}
            {filtered.length === 0 ? (
              <Text style={[styles.noResults, { color: c.mutedForeground }]}>
                لم يتم العثور على نتائج
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.section}>
      <SectionHeader title={title} icon={icon} color={c.foreground} />
      {children}
    </View>
  );
}

function SectionHeader({
  title,
  icon,
  color,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Feather name={icon} size={16} color="#7b2cbf" />
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 70,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  greetRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: 16,
  },
  greet: {
    fontFamily: "Cairo_700Bold",
    color: "#ffffff",
    fontSize: 18,
    textAlign: "right",
  },
  tagline: {
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    marginTop: 2,
    textAlign: "right",
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: { marginTop: 6 },
  section: { paddingTop: 22, marginTop: -50 },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
  catsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 8,
  },
  hScroll: {
    paddingHorizontal: 16,
  },
  banner: {
    marginTop: 24,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
    height: 160,
  },
  bannerImage: { width: "100%", height: "100%" },
  bannerOverlay: { ...StyleSheet.absoluteFillObject },
  bannerContent: {
    position: "absolute",
    inset: 0 as unknown as undefined,
    bottom: 0,
    right: 0,
    left: 0,
    top: 0,
    padding: 18,
    justifyContent: "flex-end",
  },
  bannerTitle: {
    fontFamily: "Cairo_700Bold",
    color: "#ffffff",
    fontSize: 20,
    textAlign: "right",
  },
  bannerDesc: {
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    marginTop: 4,
    textAlign: "right",
  },
  bannerBtn: {
    marginTop: 12,
    backgroundColor: "#ffffff",
    alignSelf: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  bannerBtnText: {
    fontFamily: "Cairo_600SemiBold",
    color: "#7b2cbf",
    fontSize: 13,
  },
  searchTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
    marginBottom: 4,
  },
  noResults: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "center",
    marginTop: 30,
  },
});
