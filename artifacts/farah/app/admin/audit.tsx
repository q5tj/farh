import { Feather } from "@expo/vector-icons";
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
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { adminFetchAuditLog, type AuditLogEntry } from "@/lib/data";
import { useT } from "@/lib/i18n";

const ACTION_FILTERS = [
  { id: "all", labelKey: "auditFilterAll" as const },
  { id: "role_change", labelKey: "auditActionRoleChange" as const },
  { id: "commission_change", labelKey: "auditActionCommissionChange" as const },
  { id: "content_edit", labelKey: "auditActionContentEdit" as const },
];

export default function AdminAuditScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();

  const [filter, setFilter] = useState<string>("all");
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const list = await adminFetchAuditLog(
        filter === "all" ? { limit: 200 } : { action: filter, limit: 200 },
      );
      setEntries(list);
    } catch (e) {
      console.warn("[admin audit] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const filterChips = useMemo(() => ACTION_FILTERS, []);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("adminAuditLog")} subtitle={t("adminAuditLogDesc")} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 56 }}
        contentContainerStyle={styles.filterRow}
      >
        {filterChips.map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[
                styles.chip,
                { backgroundColor: active ? c.primary : c.muted },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#ffffff" : c.foreground },
                ]}
              >
                {t(f.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : entries.length === 0 ? (
        <EmptyState icon="file-text" title={t("auditEmpty")} />
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
          {entries.map((e) => (
            <AuditCard key={e.id} entry={e} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function AuditCard({ entry }: { entry: AuditLogEntry }) {
  const c = useColors();
  const { t } = useT();
  const date = new Date(entry.createdAt);
  const dateLabel = `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1,
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;

  const actionLabel =
    entry.action === "role_change"
      ? t("auditActionRoleChange")
      : entry.action === "commission_change"
        ? t("auditActionCommissionChange")
        : entry.action === "content_edit"
          ? t("auditActionContentEdit")
          : entry.action;

  const actionIcon: keyof typeof Feather.glyphMap =
    entry.action === "role_change"
      ? "user-check"
      : entry.action === "commission_change"
        ? "percent"
        : entry.action === "content_edit"
          ? "edit-3"
          : "activity";

  const payloadStr = useMemo(() => {
    if (entry.payload && typeof entry.payload === "object") {
      try {
        return JSON.stringify(entry.payload);
      } catch {
        return String(entry.payload);
      }
    }
    return entry.payload ? String(entry.payload) : "";
  }, [entry.payload]);

  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: c.primaryBg }]}>
          <Feather name={actionIcon} size={18} color={c.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.foreground }]}>{actionLabel}</Text>
          <Text style={[styles.meta, { color: c.mutedForeground }]}>
            {entry.targetTable ?? "—"}
            {entry.targetId ? ` • ${entry.targetId.slice(0, 8)}` : ""}
            {" • "}
            {dateLabel}
          </Text>
        </View>
      </View>
      {payloadStr ? (
        <View
          style={[
            styles.payloadBox,
            { backgroundColor: c.muted, borderColor: c.border },
          ]}
        >
          <Text
            style={[styles.payloadText, { color: c.foreground }]}
            numberOfLines={3}
          >
            {payloadStr}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
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
  payloadBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  payloadText: {
    fontFamily: "Courier",
    fontSize: 11,
    textAlign: "left",
  },
});
