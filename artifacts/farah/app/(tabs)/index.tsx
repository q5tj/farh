import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CategoryPill } from "@/components/CategoryPill";
import { ProviderCard } from "@/components/ProviderCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  CategoryPillSkeleton,
  FadeIntoView,
  ProviderCardSkeleton,
} from "@/components/ui/Skeleton";
import { FEATURED_CATEGORY_SLUGS } from "@/constants/categories";
import { CITIES } from "@/constants/seedData";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { nearestCity } from "@/lib/cities-geo";
import { filterProviders, type ProviderFilters } from "@/lib/data";
import { useT } from "@/lib/i18n";

const LOCATION_PROMPT_KEY = "farh.location_prompt_v1";
const AUTO_CITY_KEY = "farh.auto_city_v1";

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { t } = useT();
  const displayName = profile?.fullName?.trim() || profile?.email || "";
  const { categories, providers, loading, refreshing, refresh } = useApp();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ProviderFilters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [locPromptOpen, setLocPromptOpen] = useState(false);
  const [autoCityToast, setAutoCityToast] = useState<string | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [showAllCats, setShowAllCats] = useState(false);
  const isWeb = Platform.OS === "web";
  const locInitRef = useRef(false);

  // First-launch flow:
  //   - if user already answered the location prompt, apply their saved city
  //     (if any) silently.
  //   - else, show the prompt modal.
  useEffect(() => {
    if (locInitRef.current) return;
    locInitRef.current = true;
    (async () => {
      try {
        const decision = await AsyncStorage.getItem(LOCATION_PROMPT_KEY);
        if (decision === "granted") {
          const savedCity = await AsyncStorage.getItem(AUTO_CITY_KEY);
          if (savedCity) {
            setFilters((f) => ({ ...f, city: savedCity }));
          }
          return;
        }
        if (decision === "denied") return;
        // Unset → ask. Delay slightly so the welcome hero doesn't get covered
        // immediately on cold start.
        setTimeout(() => setLocPromptOpen(true), 600);
      } catch {
        /* AsyncStorage failures are not fatal */
      }
    })();
  }, []);

  const onAllowLocation = async () => {
    setLocBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        await AsyncStorage.setItem(LOCATION_PROMPT_KEY, "denied");
        setLocPromptOpen(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const matched = nearestCity({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      await AsyncStorage.setItem(LOCATION_PROMPT_KEY, "granted");
      if (matched) {
        await AsyncStorage.setItem(AUTO_CITY_KEY, matched);
        setFilters((f) => ({ ...f, city: matched }));
        setAutoCityToast(matched);
        setTimeout(() => setAutoCityToast(null), 3500);
      }
    } catch (e) {
      console.warn("[home] location capture failed", e);
    } finally {
      setLocBusy(false);
      setLocPromptOpen(false);
    }
  };

  const filtered = useMemo(
    () => filterProviders(providers, { ...filters, query }),
    [providers, filters, query],
  );

  const activeFilterCount =
    (filters.city ? 1 : 0) +
    (filters.minPrice != null || filters.maxPrice != null ? 1 : 0) +
    (filters.minRating != null ? 1 : 0);

  // City is a location context — it scopes the results shown in sections
  // (topRated, topPicks) but does NOT replace the category sections with a
  // flat search list. Only an active text query or price/rating filters
  // trigger the search-results view.
  const isSearching =
    query.trim().length > 0 ||
    filters.minPrice != null ||
    filters.maxPrice != null ||
    filters.minRating != null;

  const featured = useMemo(
    () => categories.filter((cat) => FEATURED_CATEGORY_SLUGS.includes(cat.slug)),
    [categories],
  );

  // Use `filtered` (which already applies the city filter) so sections
  // respect the selected city without hiding the category grid.
  const topRated = useMemo(
    () => [...filtered].sort((a, b) => b.rating - a.rating).slice(0, 5),
    [filtered],
  );

  const topPicks = useMemo(
    () => [...filtered].sort((a, b) => b.reviews - a.reviews).slice(0, 3),
    [filtered],
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
          colors={["#9333ea", "#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.hero,
            { paddingTop: (isWeb ? Math.max(insets.top, 30) : insets.top) + 20 },
          ]}
        >
          <View style={styles.heroDecorA} />
          <View style={styles.heroDecorB} />

          <View style={styles.greetRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greet}>
                {t("greeting")} {displayName ? `، ${displayName}` : ""} 👋
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
            <View style={styles.searchRow}>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder={t("searchPlaceholder")}
                  value={query}
                  onChangeText={setQuery}
                  rightIcon={
                    <Feather name="search" size={18} color="#7b2cbf" />
                  }
                />
              </View>
              <Pressable
                onPress={() => setFilterOpen(true)}
                style={[
                  styles.filterBtn,
                  activeFilterCount > 0
                    ? { backgroundColor: "#ffffff" }
                    : { backgroundColor: "rgba(255,255,255,0.22)" },
                ]}
              >
                <Feather
                  name="sliders"
                  size={18}
                  color={activeFilterCount > 0 ? "#7b2cbf" : "#ffffff"}
                />
                {activeFilterCount > 0 ? (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>
                      {activeFilterCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>

          {/* Quick stats chips for modern feel */}
          <View style={styles.quickStatsRow}>
            <View style={styles.statChip}>
              <Feather name="users" size={12} color="#ffffff" />
              <Text style={styles.statChipText}>
                {providers.length}+ {t("homeStatProviders")}
              </Text>
            </View>
            <View style={styles.statChip}>
              <Feather name="grid" size={12} color="#ffffff" />
              <Text style={styles.statChipText}>
                {categories.length} {t("homeStatCategories")}
              </Text>
            </View>
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
        ) : (
          <FadeIntoView>
            {isSearching ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 12 }}>
                <Text style={[styles.searchTitle, { color: c.foreground }]}>
                  {t("filterResultsCount", { count: filtered.length })}
                </Text>
                {filtered.map((p) => (
                  <ProviderCard key={p.id} provider={p} />
                ))}
                {filtered.length === 0 ? (
                  <Text style={[styles.noResults, { color: c.mutedForeground }]}>
                    {t("homeNoSearchResults")}
                  </Text>
                ) : null}
              </View>
            ) : (
              <>
                <Section title={t("featured")} icon="grid" pullUp>
                  <View style={styles.catsGrid}>
                    {featured.map((cat) => (
                      <CategoryPill key={cat.id} category={cat} />
                    ))}
                  </View>
                </Section>

                <LinearGradient
                  colors={["#ec4899", "#a855f7", "#7b2cbf"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.banner}
                >
                  <View style={styles.bannerDecorA} />
                  <View style={styles.bannerDecorB} />
                  <View style={styles.bannerContent}>
                    <View style={styles.bannerSparkle}>
                      <Feather name="star" size={11} color="#7b2cbf" />
                      <Text style={styles.bannerSparkleText}>{t("featured")}</Text>
                    </View>
                    <Text style={styles.bannerTitle}>{t("heroBannerTitle")}</Text>
                    <Text style={styles.bannerDesc}>{t("heroBannerDesc")}</Text>
                    <Pressable
                      onPress={() => router.push("/category/halls")}
                      style={styles.bannerBtn}
                    >
                      <Text style={styles.bannerBtnText}>{t("heroBannerCta")}</Text>
                      <Feather name="arrow-left" size={14} color="#7b2cbf" />
                    </Pressable>
                  </View>
                </LinearGradient>

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
                    {(showAllCats ? categories : categories.slice(0, 8)).map((cat) => (
                      <CategoryPill key={cat.id} category={cat} />
                    ))}
                  </View>
                  {categories.length > 8 ? (
                    <Pressable
                      onPress={() => setShowAllCats((s) => !s)}
                      style={[styles.moreBtn, { borderColor: c.border }]}
                    >
                      <Text style={[styles.moreBtnText, { color: c.primary }]}>
                        {showAllCats ? t("showLess") : t("showMore")}
                      </Text>
                      <Feather
                        name={showAllCats ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={c.primary}
                      />
                    </Pressable>
                  ) : null}
                </Section>

                {topPicks.length > 0 ? (
                  <>
                    <SectionHeader
                      title={t("featuredForYou")}
                      icon="award"
                      color={c.foreground}
                    />
                    <View style={{ paddingHorizontal: 16, gap: 14 }}>
                      {topPicks.map((p) => (
                        <ProviderCard key={p.id} provider={p} />
                      ))}
                    </View>
                  </>
                ) : null}
              </>
            )}

            {!isSearching && providers.length === 0 ? (
              <View style={styles.emptyHint}>
                <Text style={[styles.emptyHintText, { color: c.mutedForeground }]}>
                  {t("homeEmptyBody")}
                </Text>
              </View>
            ) : null}
          </FadeIntoView>
        )}
      </ScrollView>

      <Modal
        visible={locPromptOpen}
        transparent
        animationType="fade"
      >
        <View style={locStyles.backdrop}>
          <View style={[locStyles.card, { backgroundColor: c.background }]}>
            <View style={[locStyles.iconCircle, { backgroundColor: "rgba(123,44,191,0.1)" }]}>
              <Feather name="map-pin" size={28} color={c.primary} />
            </View>
            <Text style={[locStyles.title, { color: c.foreground }]}>
              {t("locationPromptTitle")}
            </Text>
            <Text style={[locStyles.body, { color: c.mutedForeground }]}>
              {t("locationPromptBody")}
            </Text>
            <View style={locStyles.actions}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("locationPromptAllow")}
                  onPress={onAllowLocation}
                  loading={locBusy}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {autoCityToast ? (
        <View style={[locStyles.toast, { backgroundColor: c.foreground }]}>
          <Feather name="check" size={14} color={c.background} />
          <Text style={[locStyles.toastText, { color: c.background }]}>
            {t("locationDetectedCity", { city: autoCityToast })}
          </Text>
        </View>
      ) : null}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={(next) => {
          setFilters(next);
          setFilterOpen(false);
        }}
      />
    </View>
  );
}

function FilterSheet({
  open,
  onClose,
  filters,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  filters: ProviderFilters;
  onApply: (next: ProviderFilters) => void;
}) {
  const c = useColors();
  const { t } = useT();
  const [city, setCity] = useState<string | null>(filters.city ?? null);
  const [minPriceStr, setMinPriceStr] = useState(
    filters.minPrice != null ? String(filters.minPrice) : "",
  );
  const [maxPriceStr, setMaxPriceStr] = useState(
    filters.maxPrice != null ? String(filters.maxPrice) : "",
  );
  const [minRating, setMinRating] = useState<number | null>(
    filters.minRating ?? null,
  );

  // Sync internal state when sheet reopens with different filters.
  React.useEffect(() => {
    if (!open) return;
    setCity(filters.city ?? null);
    setMinPriceStr(filters.minPrice != null ? String(filters.minPrice) : "");
    setMaxPriceStr(filters.maxPrice != null ? String(filters.maxPrice) : "");
    setMinRating(filters.minRating ?? null);
  }, [open, filters]);

  const apply = () => {
    const minP = Number(minPriceStr.replace(/\D/g, ""));
    const maxP = Number(maxPriceStr.replace(/\D/g, ""));
    onApply({
      city,
      minPrice: minPriceStr && Number.isFinite(minP) ? minP : null,
      maxPrice: maxPriceStr && Number.isFinite(maxP) ? maxP : null,
      minRating,
    });
  };

  const clear = () => {
    setCity(null);
    setMinPriceStr("");
    setMaxPriceStr("");
    setMinRating(null);
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={filterStyles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            filterStyles.sheet,
            { backgroundColor: c.background },
          ]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={filterStyles.head}>
            <Text style={[filterStyles.title, { color: c.foreground }]}>
              {t("filterTitle")}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={22} color={c.foreground} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={[filterStyles.label, { color: c.foreground }]}>
              {t("filterCity")}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
            >
              <Pressable
                onPress={() => setCity(null)}
                style={[
                  filterStyles.chip,
                  { backgroundColor: city === null ? c.primary : c.muted },
                ]}
              >
                <Text
                  style={[
                    filterStyles.chipText,
                    { color: city === null ? "#ffffff" : c.foreground },
                  ]}
                >
                  {t("filterAllCities")}
                </Text>
              </Pressable>
              {CITIES.map((cn) => {
                const active = city === cn;
                return (
                  <Pressable
                    key={cn}
                    onPress={() => setCity(active ? null : cn)}
                    style={[
                      filterStyles.chip,
                      { backgroundColor: active ? c.primary : c.muted },
                    ]}
                  >
                    <Text
                      style={[
                        filterStyles.chipText,
                        { color: active ? "#ffffff" : c.foreground },
                      ]}
                    >
                      {cn}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text
              style={[filterStyles.label, { color: c.foreground, marginTop: 16 }]}
            >
              {t("filterPriceRange")}
            </Text>
            <View style={filterStyles.priceRow}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={minPriceStr}
                  onChangeText={setMinPriceStr}
                  keyboardType="number-pad"
                  placeholder={t("filterMinPrice")}
                  placeholderTextColor={c.mutedForeground}
                  style={[
                    filterStyles.priceInput,
                    {
                      borderColor: c.border,
                      color: c.foreground,
                      backgroundColor: c.card,
                    },
                  ]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={maxPriceStr}
                  onChangeText={setMaxPriceStr}
                  keyboardType="number-pad"
                  placeholder={t("filterMaxPrice")}
                  placeholderTextColor={c.mutedForeground}
                  style={[
                    filterStyles.priceInput,
                    {
                      borderColor: c.border,
                      color: c.foreground,
                      backgroundColor: c.card,
                    },
                  ]}
                />
              </View>
            </View>

            <Text
              style={[filterStyles.label, { color: c.foreground, marginTop: 16 }]}
            >
              {t("filterMinRating")}
            </Text>
            <View style={filterStyles.ratingRow}>
              <Pressable
                onPress={() => setMinRating(null)}
                style={[
                  filterStyles.ratingChip,
                  {
                    backgroundColor:
                      minRating === null ? c.primary : c.muted,
                  },
                ]}
              >
                <Text
                  style={[
                    filterStyles.chipText,
                    { color: minRating === null ? "#ffffff" : c.foreground },
                  ]}
                >
                  {t("filterAnyRating")}
                </Text>
              </Pressable>
              {[3, 4, 4.5].map((n) => {
                const active = minRating === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setMinRating(active ? null : n)}
                    style={[
                      filterStyles.ratingChip,
                      { backgroundColor: active ? c.primary : c.muted },
                    ]}
                  >
                    <Feather
                      name="star"
                      size={12}
                      color={active ? "#ffffff" : "#f59e0b"}
                    />
                    <Text
                      style={[
                        filterStyles.chipText,
                        { color: active ? "#ffffff" : c.foreground },
                      ]}
                    >
                      {n}+
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={filterStyles.actions}>
            <View style={{ flex: 1 }}>
              <Button label={t("filterApply")} onPress={apply} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t("filterClear")}
                variant="ghost"
                onPress={clear}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
    <View style={pullUp ? [styles.section, styles.sectionPullUp] : styles.section}>
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
    paddingBottom: 80,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    position: "relative",
    overflow: "hidden",
  },
  heroDecorA: {
    position: "absolute",
    top: -50,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  heroDecorB: {
    position: "absolute",
    bottom: -30,
    left: -30,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(236,72,153,0.15)",
  },
  quickStatsRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 14,
    flexWrap: "wrap",
  },
  statChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  statChipText: {
    fontFamily: "Cairo_600SemiBold",
    color: "#ffffff",
    fontSize: 11,
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
  searchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  filterBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#5a189a",
  },
  filterBadgeText: {
    color: "#ffffff",
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
  },
  section: { paddingTop: 22 },
  sectionPullUp: { marginTop: -28 },
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
    fontSize: 17,
    textAlign: "right",
    letterSpacing: -0.2,
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
    borderRadius: 24,
    overflow: "hidden",
    minHeight: 170,
    position: "relative",
    shadowColor: "#7b2cbf",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  bannerDecorA: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  bannerDecorB: {
    position: "absolute",
    bottom: -20,
    left: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  bannerContent: {
    padding: 20,
    justifyContent: "flex-end",
    flex: 1,
  },
  bannerSparkle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-end",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  bannerSparkleText: {
    fontFamily: "Cairo_700Bold",
    color: "#7b2cbf",
    fontSize: 10,
    letterSpacing: 0.3,
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
  moreBtn: {
    marginTop: 14,
    marginHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  moreBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
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

const filterStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  head: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 8,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    textAlign: "right",
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  priceRow: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  priceInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    textAlign: "right",
  },
  ratingRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  ratingChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  actions: {
    flexDirection: "row-reverse",
    gap: 10,
    marginTop: 16,
  },
});

const locStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    padding: 24,
    borderRadius: 18,
    alignItems: "center",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 18,
  },
  actions: {
    flexDirection: "row-reverse",
    gap: 10,
    width: "100%",
  },
  toast: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 100,
    maxWidth: "90%",
  },
  toastText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
});
