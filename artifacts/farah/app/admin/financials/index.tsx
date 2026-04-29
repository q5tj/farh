import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  adminFetchProvidersWithFinancials,
  type ProviderWithFinancials,
} from "@/lib/data";
import { useT } from "@/lib/i18n";

export default function AdminFinancialsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";

  const [rows, setRows] = useState<ProviderWithFinancials[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const load = async () => {
    try {
      const list = await adminFetchProvidersWithFinancials(lang);
      setRows(list);
    } catch (e) {
      console.warn("[admin financials] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.provider.name, r.provider.nameAr, r.provider.city]
        .filter(Boolean)
        .some((s) => (s ?? "").includes(q)),
    );
  }, [rows, query]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("adminFinancials")}
        subtitle={t("adminFinancialsDesc")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/admin");
        }}
      />

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Input
          placeholder={t("searchUsersPlaceholder")}
          value={query}
          onChangeText={setQuery}
          rightIcon={<Feather name="search" size={16} color={c.mutedForeground} />}
        />
      </View>

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState icon="bar-chart-2" title={t("noFinancialDataYet")} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 10,
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
          {filtered.map((row) => (
            <ProviderRow key={row.provider.id} row={row} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function ProviderRow({ row }: { row: ProviderWithFinancials }) {
  const c = useColors();
  const { t } = useT();
  const balance = row.balance;
  const balanceColor = balance > 0 ? c.destructive : c.foreground;
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/admin/financials/[providerId]",
          params: { providerId: row.provider.id },
        })
      }
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: c.foreground }]} numberOfLines={1}>
              {row.provider.name}
            </Text>
            <Text style={[styles.meta, { color: c.mutedForeground }]} numberOfLines={1}>
              {t("completedBookingsKpi")}: {row.completedCount} •{" "}
              {t("totalRevenue")}: {Math.round(row.totalRevenue).toLocaleString()}{" "}
              {t("sar")}
            </Text>
          </View>
          <View style={{ alignItems: "flex-start" }}>
            <Text style={[styles.balanceLabel, { color: c.mutedForeground }]}>
              {t("balance")}
            </Text>
            <Text
              style={[styles.balanceValue, { color: balanceColor }]}
              numberOfLines={1}
            >
              {Math.round(balance).toLocaleString()} {t("sar")}
            </Text>
          </View>
          <Feather name="chevron-left" size={18} color={c.mutedForeground} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  meta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  balanceLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
  },
  balanceValue: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    marginTop: 2,
  },
});
