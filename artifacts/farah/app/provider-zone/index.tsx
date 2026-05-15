import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookingItem } from "@/components/BookingItem";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoTip } from "@/components/ui/InfoTip";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

interface StatCardProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  tint: string;
}

function StatCard({ icon, label, value, tint }: StatCardProps) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, minWidth: 130 }}>
      <View style={[styles.iconWrap, { backgroundColor: tint + "1A" }]}>
        <Feather name={icon} size={20} color={tint} />
      </View>
      <Text style={[styles.statValue, { color: c.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.mutedForeground }]}>{label}</Text>
    </Card>
  );
}

interface ActionCardProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  desc: string;
  onPress: () => void;
  tipTitle?: string;
  tipBody?: string;
}

function ActionCard({
  icon,
  title,
  desc,
  onPress,
  tipTitle,
  tipBody,
}: ActionCardProps) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card>
        <View style={styles.actionRow}>
          <View style={[styles.actionIcon, { backgroundColor: c.primaryBg }]}>
            <Feather name={icon} size={22} color={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: c.foreground }]}>{title}</Text>
            <Text style={[styles.actionDesc, { color: c.mutedForeground }]}>{desc}</Text>
          </View>
          {tipTitle && tipBody ? (
            <InfoTip title={tipTitle} body={tipBody} />
          ) : null}
          <Feather name="chevron-left" size={20} color={c.mutedForeground} />
        </View>
      </Card>
    </Pressable>
  );
}

export default function ProviderHome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const { providerBookings, commissionRate } = useApp();

  const providerId = profile?.providerId ?? null;
  const verificationStatus = profile?.providerVerificationStatus ?? null;

  // Gate: admins always see the dashboard. Non-admins go through three states:
  //   • no providers row              → onboarding form
  //   • status pending or rejected    → pending screen
  //   • status approved               → this dashboard
  useEffect(() => {
    if (!profile) return;
    if (profile.role === "admin") return;
    if (!providerId) {
      router.replace("/provider-zone/onboarding");
      return;
    }
    if (verificationStatus && verificationStatus !== "approved") {
      router.replace("/provider-zone/pending");
    }
  }, [profile, providerId, verificationStatus]);

  const pending = useMemo(
    () => providerBookings.filter((b) => b.status === "pending"),
    [providerBookings],
  );
  const completed = useMemo(
    () => providerBookings.filter((b) => b.status === "completed"),
    [providerBookings],
  );

  const grossEarnings = completed.reduce((sum, b) => sum + b.price, 0);
  const netEarnings = grossEarnings * (1 - commissionRate / 100);

  if (profile?.role !== "admin") {
    if (!providerId) {
      // Waiting for redirect to onboarding.
      return <View style={{ flex: 1, backgroundColor: c.background }} />;
    }
    if (verificationStatus && verificationStatus !== "approved") {
      // Waiting for redirect to pending screen.
      return <View style={{ flex: 1, backgroundColor: c.background }} />;
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("providerHome")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/profile");
        }}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 30,
          gap: 16,
        }}
      >
        <View style={styles.statsGrid}>
          <StatCard
            icon="calendar"
            label={t("totalBookings")}
            value={String(providerBookings.length)}
            tint="#7b2cbf"
          />
          <StatCard
            icon="clock"
            label={t("pendingBookings")}
            value={String(pending.length)}
            tint="#f59e0b"
          />
        </View>
        <View style={styles.statsGrid}>
          <StatCard
            icon="check-circle"
            label={t("completedBookings")}
            value={String(completed.length)}
            tint="#16a34a"
          />
          <StatCard
            icon="dollar-sign"
            label={t("earnings")}
            value={`${Math.round(netEarnings).toLocaleString()} ${t("sar")}`}
            tint="#9d4edd"
          />
        </View>

        <Text style={[styles.commission, { color: c.mutedForeground }]}>
          {t("netEarningsNote", { rate: commissionRate })}
        </Text>

        <View style={{ gap: 10 }}>
          <ActionCard
            icon="briefcase"
            title={t("manageStoreInfo")}
            desc={t("manageStoreInfoDesc")}
            onPress={() => router.push("/provider-zone/store-info" as never)}
            tipTitle={t("tipProviderStoreInfoTitle")}
            tipBody={t("tipProviderStoreInfoBody")}
          />
          <ActionCard
            icon="package"
            title={t("myServices")}
            desc={t("myServicesDesc")}
            onPress={() => router.push("/provider-zone/services")}
            tipTitle={t("tipProviderServicesTitle")}
            tipBody={t("tipProviderServicesBody")}
          />
          <ActionCard
            icon="inbox"
            title={t("incomingRequests")}
            desc={t("pendingRequestsDesc", { count: pending.length })}
            onPress={() => router.push("/provider-zone/requests")}
            tipTitle={t("tipProviderRequestsTitle")}
            tipBody={t("tipProviderRequestsBody")}
          />
          <ActionCard
            icon="file-text"
            title={t("providerFinancials")}
            desc={t("providerFinancialsDesc")}
            onPress={() =>
              router.push("/provider-zone/financials" as never)
            }
            tipTitle={t("tipProviderFinancialsTitle")}
            tipBody={t("tipProviderFinancialsBody")}
          />
        </View>

        <Text
          style={[styles.sectionTitle, { color: c.foreground, marginTop: 8 }]}
        >
          {t("recentRequests")}
        </Text>
        {providerBookings.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={t("noRequestsYet")}
            description={t("noRequestsYetDesc")}
          />
        ) : (
          <View>
            {providerBookings.slice(0, 5).map((b) => (
              <BookingItem key={b.id} booking={b} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 22 },
  statLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  actionRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    textAlign: "right",
  },
  actionDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 3,
    textAlign: "right",
  },
  commission: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    marginTop: -8,
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
});
