import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo } from "react";
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
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { STRINGS } from "@/constants/strings";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

interface StatCardProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  tint: string;
}

function StatCard({ icon, label, value, tint }: StatCardProps) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
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
}

function ActionCard({ icon, title, desc, onPress }: ActionCardProps) {
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
          <Feather name="chevron-left" size={20} color={c.mutedForeground} />
        </View>
      </Card>
    </Pressable>
  );
}

export default function ProviderHome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { bookings, commissionRate } = useApp();

  const providerId = user?.providerId ?? "p1";
  const myBookings = useMemo(
    () => bookings.filter((b) => b.providerId === providerId),
    [bookings, providerId],
  );
  const pending = myBookings.filter((b) => b.status === "pending");
  const completed = myBookings.filter((b) => b.status === "completed");

  const grossEarnings = completed.reduce((sum, b) => sum + b.price, 0);
  const netEarnings = grossEarnings * (1 - commissionRate / 100);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={STRINGS.providerHome} />
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
            label={STRINGS.totalBookings}
            value={String(myBookings.length)}
            tint="#7b2cbf"
          />
          <StatCard
            icon="clock"
            label={STRINGS.pendingBookings}
            value={String(pending.length)}
            tint="#f59e0b"
          />
        </View>
        <View style={styles.statsGrid}>
          <StatCard
            icon="check-circle"
            label={STRINGS.completedBookings}
            value={String(completed.length)}
            tint="#16a34a"
          />
          <StatCard
            icon="dollar-sign"
            label={STRINGS.earnings}
            value={`${Math.round(netEarnings).toLocaleString()} ر.س`}
            tint="#9d4edd"
          />
        </View>

        <Text style={[styles.commission, { color: c.mutedForeground }]}>
          * صافي الأرباح بعد خصم العمولة ({commissionRate}%)
        </Text>

        <View style={{ gap: 10 }}>
          <ActionCard
            icon="package"
            title={STRINGS.myServices}
            desc="أضف وعدّل خدماتك وأسعارها"
            onPress={() => router.push("/provider-zone/services")}
          />
          <ActionCard
            icon="inbox"
            title={STRINGS.incomingRequests}
            desc={`${pending.length} طلب بانتظار الرد`}
            onPress={() => router.push("/provider-zone/requests")}
          />
        </View>

        <Text
          style={[styles.sectionTitle, { color: c.foreground, marginTop: 8 }]}
        >
          آخر الطلبات
        </Text>
        {myBookings.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="لا توجد طلبات بعد"
            description="ستظهر طلبات الحجز الواردة هنا"
          />
        ) : (
          <View>
            {myBookings.slice(0, 5).map((b) => (
              <BookingItem key={b.id} booking={b} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: "row-reverse", gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 22 },
  statLabel: {
    fontFamily: "Inter_400Regular",
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
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    textAlign: "right",
  },
  actionDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 3,
    textAlign: "right",
  },
  commission: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "right",
    marginTop: -8,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
});
