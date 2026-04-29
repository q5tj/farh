import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
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
import {
  adminFetchDashboardStats,
  adminFetchProvidersByStatus,
  type DashboardStats,
} from "@/lib/data";
import { useT } from "@/lib/i18n";

interface ActionTile {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  desc: string;
  route: string;
  color: string;
  badge?: number;
}

export default function AdminHome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const isWeb = Platform.OS === "web";
  const { commissionRate } = useApp();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pendingVerifications, setPendingVerifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [s, pending] = await Promise.all([
        adminFetchDashboardStats(),
        adminFetchProvidersByStatus("pending", "ar").catch(() => []),
      ]);
      setStats(s);
      setPendingVerifications(pending.length);
    } catch (e) {
      console.warn("[admin home] stats failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const ourCut = stats ? stats.totalRevenue * (commissionRate / 100) : 0;

  const tiles: ActionTile[] = [
    {
      icon: "users",
      title: t("manageUsers"),
      desc: stats ? t("manageUsersDesc", { count: stats.totalUsers }) : t("customers"),
      route: "/admin/users",
      color: "#7b2cbf",
    },
    {
      icon: "calendar",
      title: t("manageBookings"),
      desc: stats ? t("manageBookingsDesc", { count: stats.totalBookings }) : t("manageBookings"),
      route: "/admin/bookings",
      color: "#5a189a",
    },
    {
      icon: "list",
      title: t("manageCategories"),
      desc: t("manageCategoriesDesc"),
      route: "/admin/categories",
      color: "#9d4edd",
    },
    {
      icon: "help-circle",
      title: t("supportTicketsTitle"),
      desc: stats?.openTickets
        ? t("supportTicketsDescNew", { count: stats.openTickets })
        : t("supportTicketsDescDefault"),
      route: "/admin/tickets",
      color: "#ec4899",
      badge: stats?.openTickets ?? 0,
    },
    {
      icon: "shield",
      title: t("adminVerifications"),
      desc: t("adminVerificationsDesc", { count: pendingVerifications }),
      route: "/admin/verifications",
      color: "#16a34a",
      badge: pendingVerifications,
    },
    {
      icon: "file-text",
      title: t("adminAuditLog"),
      desc: t("adminAuditLogDesc"),
      route: "/admin/audit",
      color: "#525252",
    },
    {
      icon: "send",
      title: t("broadcastNotification"),
      desc: t("broadcastDesc"),
      route: "/admin/broadcast",
      color: "#c026d3",
    },
    {
      icon: "star",
      title: t("adminReviews"),
      desc: t("adminReviewsDesc"),
      route: "/admin/reviews",
      color: "#f59e0b",
    },
    {
      icon: "rotate-ccw",
      title: t("adminRefunds"),
      desc: t("adminRefundsDesc"),
      route: "/admin/refunds",
      color: "#dc2626",
    },
    {
      icon: "settings",
      title: t("appSettingsTitle"),
      desc: t("appSettingsDesc"),
      route: "/admin/settings",
      color: "#7b2cbf",
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("adminHome")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/profile");
        }}
      />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 30,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={c.primary}
          />
        }
      >
        <LinearGradient
          colors={["#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroLabel}>{t("platformCommissionTotal")}</Text>
          <Text style={styles.heroValue}>
            {Math.round(ourCut).toLocaleString()} ر.س
          </Text>
          <View style={styles.heroFooter}>
            <Feather name="trending-up" size={14} color="#ffffff" />
            <Text style={styles.heroFooterText}>
              {t("fromRevenue", {
                revenue: (stats?.totalRevenue ?? 0).toLocaleString(),
              })}
            </Text>
          </View>
        </LinearGradient>

        {loading ? (
          <View style={{ paddingTop: 24, alignItems: "center" }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : (
          <View style={styles.kpisRow}>
            <KpiCard
              label={t("providers")}
              value={String(stats?.totalProviders ?? 0)}
              icon="briefcase"
            />
            <KpiCard
              label={t("customers")}
              value={String(stats?.totalCustomers ?? 0)}
              icon="users"
            />
            <KpiCard
              label={t("completedBookingsKpi")}
              value={String(stats?.completedBookings ?? 0)}
              icon="check-circle"
            />
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: c.foreground }]}>
          {t("adminMenuTitle")}
        </Text>
        <View style={styles.tilesGrid}>
          {tiles.map((t) => (
            <Pressable
              key={t.route}
              onPress={() => router.push(t.route as never)}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: c.card,
                  borderColor: c.border,
                  borderRadius: c.radius,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View
                style={[styles.tileIcon, { backgroundColor: t.color + "1A" }]}
              >
                <Feather name={t.icon} size={22} color={t.color} />
                {t.badge ? (
                  <View style={[styles.badge, { backgroundColor: t.color }]}>
                    <Text style={styles.badgeText}>
                      {t.badge > 99 ? "99+" : t.badge}
                    </Text>
                  </View>
                ) : null}
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
          {t("adminQuickGlance")}
        </Text>
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            <SummaryRow
              label={t("pendingBookingsCount")}
              value={String(stats?.pendingBookings ?? 0)}
              accent={(stats?.pendingBookings ?? 0) > 0}
            />
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <SummaryRow
              label={t("newSupportTickets")}
              value={String(stats?.openTickets ?? 0)}
              accent={(stats?.openTickets ?? 0) > 0}
            />
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <SummaryRow
              label={t("totalBookingsAllTime")}
              value={String(stats?.totalBookings ?? 0)}
            />
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
      <Text style={[styles.kpiLabel, { color: c.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  const c = useColors();
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: c.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          { color: accent ? c.primary : c.foreground },
        ]}
      >
        {value}
      </Text>
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
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  kpi: {
    flex: 1,
    minWidth: 110,
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
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
  },
  tileTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  tileDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    textAlign: "right",
    lineHeight: 16,
  },
  summaryRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  summaryLabel: { fontFamily: "Cairo_500Medium", fontSize: 13 },
  summaryValue: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  divider: { height: 1 },
});
