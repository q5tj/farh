import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CategoryPill } from "@/components/CategoryPill";
import { ProviderCard } from "@/components/ProviderCard";
import { Input } from "@/components/ui/Input";
import {
  CategoryPillSkeleton,
  FadeIntoView,
  ProviderCardSkeleton,
} from "@/components/ui/Skeleton";
import { FEATURED_CATEGORY_SLUGS } from "@/constants/categories";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { t } = useT();
  const displayName = profile?.fullName?.trim() || profile?.email || "";
  const { categories, providers, loading, refreshing, refresh } = useApp();
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
    () => categories.filter((cat) => FEATURED_CATEGORY_SLUGS.includes(cat.slug)),
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={c.primary}
          />
        }
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
                {t("greeting")} {displayName ? `، ${displayName}` : ""}
              </Text>
              <Text style={styles.tagline}>{t("tagline")}</Text>
            </View>
            <View style={styles.bell}>
              <Pressable onPress={() => router.push("/(tabs)/notifications")}>
                <Feather name="bell" size={20} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Input
              placeholder={t("searchPlaceholder")}
              value={query}
              onChangeText={setQuery}
              rightIcon={<Feather name="search" size={18} color="#7b2cbf" />}
            />
          </View>
        </LinearGradient>

        {loading && categories.length === 0 ? (
          <View style={{ marginTop: -50, paddingTop: 22 }}>
            <View style={styles.sectionHeader}>
              <View style={{ width: 100, height: 16, backgroundColor: c.muted, borderRadius: 8 }} />
            </View>
            <View style={styles.catsGrid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <CategoryPillSkeleton key={i} />
              ))}
            </View>
            <View style={[styles.banner, { backgroundColor: c.muted }]} />
            <View style={{ paddingHorizontal: 16, gap: 14, marginTop: 24 }}>
              {Array.from({ length: 2 }).map((_, i) => (
                <ProviderCardSkeleton key={i} />
              ))}
            </View>
          </View>
        ) : query.length === 0 ? (
          <FadeIntoView>
            <Section title={t("featured")} icon="grid" pullUp>
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

            {topRated.length > 0 ? (
              <>
                <SectionHeader
                  title={t("topRated")}
                  icon="star"
                  color={c.foreground}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hScroll}
                >
                  {topRated.map((p) => (
                    <ProviderCard
                      key={p.id}
                      provider={p}
                      variant="horizontal"
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Section title={t("allCategories")} icon="layers">
              <View style={styles.catsGrid}>
                {categories.map((cat) => (
                  <CategoryPill key={cat.id} category={cat} />
                ))}
              </View>
            </Section>

            {topPicks.length > 0 ? (
              <>
                <SectionHeader title="مختار لك" icon="award" color={c.foreground} />
                <View style={{ paddingHorizontal: 16, gap: 14 }}>
                  {topPicks.map((p) => (
                    <ProviderCard key={p.id} provider={p} />
                  ))}
                </View>
              </>
            ) : null}

            {providers.length === 0 ? (
              <View style={styles.emptyHint}>
                <Text style={[styles.emptyHintText, { color: c.mutedForeground }]}>
                  لم يُسجَّل مزودو خدمة بعد. كن أول مزود — افتح قائمة "حسابي" واختر "كن مزود خدمة".
                </Text>
              </View>
            ) : null}
          </FadeIntoView>
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
  pullUp,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
  /** Pull the section up into the hero gradient. Use only for the FIRST section. */
  pullUp?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.section, pullUp && styles.sectionPullUp]}>
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
  section: { paddingTop: 22 },
  sectionPullUp: { marginTop: -50 },
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
  loadingWrap: {
    paddingTop: 60,
    alignItems: "center",
  },
  emptyHint: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  emptyHintText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 21,
  },
});
