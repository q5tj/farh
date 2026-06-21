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

      <View style={[styles.filterRow, { borderBottomColor: c.border }]}>
        {filterChips.map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={({ pressed }) => [
                styles.filterTab,
                {
                  opacity: pressed ? 0.7 : 1,
                  borderBottomColor: active ? c.primary : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.filterTabText,
                  {
                    color: active ? c.primary : c.mutedForeground,
                    fontFamily: active ? "Cairo_700Bold" : "Cairo_600SemiBold",
                  },
                ]}
                numberOfLines={2}
                allowFontScaling={false}
              >
                {t(f.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

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

function jsonbToNumeric(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.replace(/^"|"$/g, "");
  return String(v);
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

  const actionIcon: keyof typeof Feather.glyphMap =
    entry.action === "role_change"
      ? "user-check"
      : entry.action === "commission_change"
        ? "percent"
        : entry.action === "content_edit"
          ? "edit-3"
          : entry.action === "refund_mark"
            ? "rotate-ccw"
            : "activity";

  // Build the human-readable sentence from the payload.
  const sentence = useMemo(() => {
    const actor = entry.actorName ?? t("auditUnknownActor");
    const p = (entry.payload ?? {}) as Record<string, unknown>;
    let action = "";
    switch (entry.action) {
      case "commission_change":
        action = t("auditCommissionMsg", {
          from: jsonbToNumeric(p.from),
          to: jsonbToNumeric(p.to),
        });
        break;
      case "role_change":
        action = t("auditRoleMsg", {
          from: jsonbToNumeric(p.from),
          to: jsonbToNumeric(p.to),
        });
        break;
      case "content_edit":
        action = t("auditContentMsg", {
          key: jsonbToNumeric((p.key ?? entry.targetId) as unknown),
        });
        break;
      case "refund_mark":
        action = t("auditRefundMsg", {
          status: jsonbToNumeric(p.status),
        });
        break;
      default:
        action = entry.action;
    }
    return t("auditByUser", { actor, action });
  }, [entry, t]);

  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: c.primaryBg }]}>
          <Feather name={actionIcon} size={18} color={c.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.foreground }]}>
            {sentence}
          </Text>
          <Text style={[styles.meta, { color: c.mutedForeground }]}>
            {dateLabel}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
  },
  filterTab: {
    flex: 1,
    minWidth: 0,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  filterTabText: {
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
    textAlign: "center",
  },
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
