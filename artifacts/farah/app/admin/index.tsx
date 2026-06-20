import { Feather } from "@expo/vector-icons";
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
import { InfoTip } from "@/components/ui/InfoTip";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
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
  tipTitle: string;
  tipBody: string;
}

export default function AdminHome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const isWeb = Platform.OS === "web";

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

  const tiles: ActionTile[] = [
    {
      icon: "users",
      title: t("manageUsers"),
      desc: stats ? t("manageUsersDesc", { count: stats.totalUsers }) : t("customers"),
      route: "/admin/users",
      color: "#7b2cbf",
      tipTitle: t("tipAdminUsersTitle"),
      tipBody: t("tipAdminUsersBody"),
    },
    {
      icon: "calendar",
      title: t("manageBookings"),
      desc: stats ? t("manageBookingsDesc", { count: stats.totalBookings }) : t("manageBookings"),
      route: "/admin/bookings",
      color: "#5a189a",
      tipTitle: t("tipAdminBookingsTitle"),
      tipBody: t("tipAdminBookingsBody"),
    },
    {
      icon: "list",
      title: t("manageCategories"),
      desc: t("manageCategoriesDesc"),
      route: "/admin/categories",
      color: "#9d4edd",
      tipTitle: t("tipAdminCategoriesTitle"),
      tipBody: t("tipAdminCategoriesBody"),
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
      tipTitle: t("tipAdminTicketsTitle"),
      tipBody: t("tipAdminTicketsBody"),
    },
    {
      icon: "shield",
      title: t("adminVerifications"),
      desc: t("adminVerificationsDesc", { count: pendingVerifications }),
      route: "/admin/verifications",
      color: "#16a34a",
      badge: pendingVerifications,
      tipTitle: t("tipAdminVerificationsTitle"),
      tipBody: t("tipAdminVerificationsBody"),
    },
    {
      icon: "link",
      title: t("adminMoyasarStatus"),
      desc: t("adminMoyasarStatusDesc"),
      route: "/admin/moyasar-status",
      color: "#25D366",
      tipTitle: t("adminMoyasarStatus"),
      tipBody: t("adminMoyasarStatusDesc"),
    },
    {
      icon: "file-text",
      title: t("adminAuditLog"),
      desc: t("adminAuditLogDesc"),
      route: "/admin/audit",
      color: "#525252",
      tipTitle: t("tipAdminAuditTitle"),
      tipBody: t("tipAdminAuditBody"),
    },
    {
      icon: "send",
      title: t("broadcastNotification"),
      desc: t("broadcastDesc"),
      route: "/admin/broadcast",
      color: "#c026d3",
      tipTitle: t("tipAdminBroadcastTitle"),
      tipBody: t("tipAdminBroadcastBody"),
    },
    {
      icon: "star",
      title: t("adminReviews"),
      desc: t("adminReviewsDesc"),
      route: "/admin/reviews",
      color: "#f59e0b",
      tipTitle: t("tipAdminReviewsTitle"),
      tipBody: t("tipAdminReviewsBody"),
    },
    {
      icon: "rotate-ccw",
      title: t("adminRefunds"),
      desc: t("adminRefundsDesc"),
      route: "/admin/refunds",
      color: "#dc2626",
      tipTitle: t("tipAdminRefundsTitle"),
      tipBody: t("tipAdminRefundsBody"),
    },
    {
      icon: "send",
      title: t("adminPayouts"),
      desc: t("adminPayoutsDesc"),
      route: "/admin/payouts",
      color: "#0ea5e9",
      tipTitle: t("tipAdminPayoutsTitle"),
      tipBody: t("tipAdminPayoutsBody"),
    },
    {
      icon: "dollar-sign",
      title: t("adminFinancials"),
      desc: t("adminFinancialsDesc"),
      route: "/admin/financials",
      color: "#16a34a",
      tipTitle: t("tipAdminFinancialsTitle"),
      tipBody: t("tipAdminFinancialsBody"),
    },
    {
      icon: "settings",
      title: t("appSettingsTitle"),
      desc: t("appSettingsDesc"),
      route: "/admin/settings",
      color: "#7b2cbf",
      tipTitle: t("tipAdminSettingsTitle"),
      tipBody: t("tipAdminSettingsBody"),
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
          {tiles.map((tile) => (
            <Pressable
              key={tile.route}
              onPress={() => router.push(tile.route as never)}
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
              <View style={styles.tileTopRow}>
                <View
                  style={[styles.tileIcon, { backgroundColor: tile.color + "1A" }]}
                >
                  <Feather name={tile.icon} size={22} color={tile.color} />
                  {tile.badge ? (
                    <View style={[styles.badge, { backgroundColor: tile.color }]}>
                      <Text style={styles.badgeText}>
                        {tile.badge > 99 ? "99+" : tile.badge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <InfoTip
                  title={tile.tipTitle}
                  body={tile.tipBody}
                  tint={tile.color}
                />
              </View>
              <Text style={[styles.tileTitle, { color: c.foreground }]}>
                {tile.title}
              </Text>
              <Text style={[styles.tileDesc, { color: c.mutedForeground }]}>
                {tile.desc}
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
  kpisRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
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
  tileTopRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
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
