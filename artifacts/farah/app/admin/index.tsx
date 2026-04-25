import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

interface ActionTile {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  desc: string;
  route: string;
  color: string;
}

const TILES: ActionTile[] = [
  {
    icon: "users",
    title: "إدارة المستخدمين",
    desc: "العملاء ومزودو الخدمة",
    route: "/admin/users",
    color: "#7b2cbf",
  },
  {
    icon: "list",
    title: "إدارة التصنيفات",
    desc: "أضف وعدّل التصنيفات",
    route: "/admin/categories",
    color: "#9d4edd",
  },
  {
    icon: "calendar",
    title: "إدارة الطلبات",
    desc: "متابعة جميع الحجوزات",
    route: "/admin/bookings",
    color: "#5a189a",
  },
  {
    icon: "send",
    title: "إشعار جماعي",
    desc: "أرسل إشعار لكل المستخدمين",
    route: "/admin/broadcast",
    color: "#c026d3",
  },
  {
    icon: "settings",
    title: "العمولة والإعدادات",
    desc: "تعديل نسبة العمولة",
    route: "/admin/settings",
    color: "#7b2cbf",
  },
];

export default function AdminHome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { bookings, providers, categories, commissionRate } = useApp();

  const stats = useMemo(() => {
    const total = bookings.length;
    const completed = bookings.filter((b) => b.status === "completed");
    const revenue = completed.reduce((s, b) => s + b.price, 0);
    const ourCut = revenue * (commissionRate / 100);
    return {
      total,
      revenue,
      ourCut,
      providers: providers.length,
      activeCategories: categories.length,
    };
  }, [bookings, providers, categories, commissionRate]);

  const topCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    bookings.forEach((b) => {
      const p = providers.find((pr) => pr.id === b.providerId);
      if (!p) return;
      counts[p.categoryId] = (counts[p.categoryId] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([id, count]) => {
        const cat = categories.find((c) => c.id === id);
        return cat ? { name: cat.name, count, color: cat.color } : null;
      })
      .filter((v): v is { name: string; count: number; color: string } => !!v)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [bookings, providers, categories]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="لوحة تحكم المالك" />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 30,
        }}
      >
        <LinearGradient
          colors={["#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroLabel}>إجمالي عمولات المنصة</Text>
          <Text style={styles.heroValue}>
            {Math.round(stats.ourCut).toLocaleString()} ر.س
          </Text>
          <View style={styles.heroFooter}>
            <Feather name="trending-up" size={14} color="#ffffff" />
            <Text style={styles.heroFooterText}>
              من إيرادات بقيمة {stats.revenue.toLocaleString()} ر.س
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.kpisRow}>
          <KpiCard label="الطلبات" value={String(stats.total)} icon="calendar" />
          <KpiCard label="مزودو الخدمة" value={String(stats.providers)} icon="briefcase" />
          <KpiCard
            label="التصنيفات"
            value={String(stats.activeCategories)}
            icon="grid"
          />
        </View>

        <Text style={[styles.sectionTitle, { color: c.foreground }]}>
          إدارة المنصة
        </Text>
        <View style={styles.tilesGrid}>
          {TILES.map((t) => (
            <Pressable
              key={t.route}
              onPress={() => router.push(t.route as any)}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: c.card,
                  borderColor: c.border,
                  borderRadius: c.radius,
                  opacity: pressed ? 0.85 : 1,
                  ...(isWeb
                    ? ({ boxShadow: "0 1px 3px rgba(123,44,191,0.06)" } as object)
                    : {}),
                },
              ]}
            >
              <View
                style={[styles.tileIcon, { backgroundColor: t.color + "1A" }]}
              >
                <Feather name={t.icon} size={22} color={t.color} />
              </View>
              <Text style={[styles.tileTitle, { color: c.foreground }]}>
                {t.title}
              </Text>
              <Text style={[styles.tileDesc, { color: c.mutedForeground }]}>
                {t.desc}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text
          style={[styles.sectionTitle, { color: c.foreground, marginTop: 8 }]}
        >
          أكثر التصنيفات طلباً
        </Text>
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            {topCategories.length === 0 ? (
              <Text style={[styles.emptyText, { color: c.mutedForeground }]}>
                لا توجد بيانات بعد
              </Text>
            ) : (
              topCategories.map((cat, i) => {
                const max = topCategories[0]?.count ?? 1;
                const w = (cat.count / max) * 100;
                return (
                  <View key={i} style={{ marginBottom: 12 }}>
                    <View style={styles.barRow}>
                      <Text
                        style={[styles.barLabel, { color: c.foreground }]}
                      >
                        {cat.name}
                      </Text>
                      <Text
                        style={[
                          styles.barValue,
                          { color: c.mutedForeground },
                        ]}
                      >
                        {cat.count} حجز
                      </Text>
                    </View>
                    <View
                      style={[styles.barTrack, { backgroundColor: c.muted }]}
                    >
                      <View
                        style={[
                          styles.barFill,
                          { width: `${w}%`, backgroundColor: cat.color },
                        ]}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  const c = useColors();
  return (
    <View
      style={[
        styles.kpi,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderRadius: c.radius,
        },
      ]}
    >
      <Feather name={icon} size={18} color={c.primary} />
      <Text style={[styles.kpiValue, { color: c.foreground }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: c.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    margin: 16,
    padding: 22,
    borderRadius: 20,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
  },
  heroValue: {
    color: "#ffffff",
    fontFamily: "Cairo_700Bold",
    fontSize: 32,
    marginTop: 6,
    textAlign: "right",
  },
  heroFooter: {
    marginTop: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  heroFooterText: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
  },
  kpisRow: {
    flexDirection: "row-reverse",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  kpi: {
    flex: 1,
    padding: 14,
    borderWidth: 1,
    alignItems: "flex-end",
    gap: 6,
  },
  kpiValue: { fontFamily: "Cairo_700Bold", fontSize: 20 },
  kpiLabel: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    textAlign: "right",
  },
  tilesGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 24,
  },
  tile: {
    width: "48%",
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  tileDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    textAlign: "right",
    lineHeight: 16,
  },
  emptyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },
  barRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  barLabel: { fontFamily: "Cairo_500Medium", fontSize: 13 },
  barValue: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  barTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
});
