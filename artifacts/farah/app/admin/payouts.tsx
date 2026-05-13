import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
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

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { confirmDialog, infoDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import {
  adminCreateMoyasarPayout,
  adminFetchProviderPayouts,
  adminMarkPayoutManuallySettled,
  adminProcessMoyasarPayouts,
  type PayoutStatus,
  type ProviderPayoutRow,
} from "@/lib/payments";

/**
 * Admin: provider payouts queue + history.
 *
 * Rows are created automatically by mark_payment_paid via the
 * `enqueue_provider_payout` RPC (see migration v23). When Moyasar's
 * Payouts API is enabled (app_settings.moyasar_payouts_enabled),
 * new rows land as 'queued' and get processed by the edge function.
 * Otherwise they land as 'manual_pending' and an admin settles them
 * by hand via bank transfer to the provider's IBAN.
 */
export default function AdminPayoutsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [rows, setRows] = useState<ProviderPayoutRow[]>([]);
  const [filter, setFilter] = useState<PayoutStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await adminFetchProviderPayouts();
      setRows(list);
    } catch (e) {
      console.warn("[admin payouts] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered =
    filter === "all" ? rows : rows.filter((r) => r.status === filter);

  const processAll = async () => {
    const ok = await confirmDialog({
      title: t("processQueuedPayoutsTitle"),
      message: t("processQueuedPayoutsBody"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await adminProcessMoyasarPayouts();
      await infoDialog({
        title: t("payoutsProcessedTitle"),
        message: t("payoutsProcessedBody", {
          ok: String(result.results.filter((r) => r.ok).length),
          fail: String(result.results.filter((r) => !r.ok).length),
        }),
      });
      await load();
    } catch (e) {
      await infoDialog({
        title: t("error"),
        message: (e as Error)?.message ?? "",
      });
    } finally {
      setBusy(false);
    }
  };

  const retry = async (row: ProviderPayoutRow) => {
    setBusy(true);
    try {
      const r = await adminCreateMoyasarPayout(row.id);
      if (r.error) {
        await infoDialog({ title: t("error"), message: r.error });
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const markManual = async (row: ProviderPayoutRow) => {
    const ok = await confirmDialog({
      title: t("markPayoutManuallySettledTitle"),
      message: t("markPayoutManuallySettledBody", {
        amount: row.amountSar.toLocaleString(),
      }),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await adminMarkPayoutManuallySettled(row.id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const FILTERS: { id: PayoutStatus | "all"; label: string }[] = [
    { id: "all", label: t("all") },
    { id: "manual_pending", label: t("payoutStatusManualPending") },
    { id: "queued", label: t("payoutStatusQueued") },
    { id: "initiated", label: t("payoutStatusInitiated") },
    { id: "failed", label: t("payoutStatusFailed") },
    { id: "completed", label: t("payoutStatusCompleted") },
  ];

  const queuedCount = rows.filter((r) => r.status === "queued").length;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("adminPayouts")}
        subtitle={t("adminPayoutsDesc")}
      />

      {queuedCount > 0 ? (
        <View style={[styles.processBar, { borderColor: c.border }]}>
          <Text style={[styles.processText, { color: c.foreground }]}>
            {t("payoutsQueuedCount", { count: queuedCount })}
          </Text>
          <Button
            label={t("processAllPayouts")}
            onPress={processAll}
            loading={busy}
            size="sm"
            fullWidth={false}
          />
        </View>
      ) : null}

      <View style={[styles.filterRow, { flexDirection: "row-reverse" }]}>
        {FILTERS.map((f) => {
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
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState icon="dollar-sign" title={t("noPayoutsInCategory")} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 12,
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
            <PayoutCard
              key={row.id}
              row={row}
              busy={busy}
              onRetry={() => retry(row)}
              onMarkManual={() => markManual(row)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function PayoutCard({
  row,
  busy,
  onRetry,
  onMarkManual,
}: {
  row: ProviderPayoutRow;
  busy: boolean;
  onRetry: () => void;
  onMarkManual: () => void;
}) {
  const c = useColors();
  const { t } = useT();
  const STATUS_COLORS: Record<PayoutStatus, { bg: string; fg: string }> = {
    manual_pending: { bg: "#fef3c7", fg: "#a16207" },
    queued: { bg: "#dbeafe", fg: "#1d4ed8" },
    initiated: { bg: "#e0e7ff", fg: "#4338ca" },
    completed: { bg: "#dcfce7", fg: "#15803d" },
    failed: { bg: "#fee2e2", fg: "#991b1b" },
    cancelled: { bg: "#f3f4f6", fg: "#525252" },
  };
  const STATUS_LABEL: Record<PayoutStatus, string> = {
    manual_pending: t("payoutStatusManualPending"),
    queued: t("payoutStatusQueued"),
    initiated: t("payoutStatusInitiated"),
    completed: t("payoutStatusCompleted"),
    failed: t("payoutStatusFailed"),
    cancelled: t("payoutStatusCancelled"),
  };
  const palette = STATUS_COLORS[row.status];
  return (
    <Card>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.foreground }]}>
            {row.providerName ?? "—"}
          </Text>
          {row.serviceTitle ? (
            <Text style={[styles.meta, { color: c.mutedForeground }]}>
              {row.serviceTitle}
            </Text>
          ) : null}
        </View>
        <View style={[styles.pill, { backgroundColor: palette.bg }]}>
          <Text style={[styles.pillText, { color: palette.fg }]}>
            {STATUS_LABEL[row.status]}
          </Text>
        </View>
      </View>

      <View style={[styles.amountRow]}>
        <Text style={[styles.amount, { color: c.primary }]}>
          {row.amountSar.toLocaleString()} {t("sar")}
        </Text>
        {row.payoutType ? (
          <Text style={[styles.payoutType, { color: c.mutedForeground }]}>
            {row.payoutType === "deposit_share"
              ? t("payoutTypeDeposit")
              : row.payoutType === "final_share"
                ? t("payoutTypeFinal")
                : t("payoutTypeManual")}
          </Text>
        ) : null}
      </View>

      {row.failureReason ? (
        <Text style={[styles.reason, { color: c.destructive }]}>
          {row.failureReason}
        </Text>
      ) : null}

      {row.moyasarPayoutId ? (
        <Text style={[styles.meta, { color: c.mutedForeground }]}>
          Moyasar ID: {row.moyasarPayoutId}
        </Text>
      ) : null}

      {row.status === "queued" || row.status === "failed" ? (
        <View style={styles.actionsRow}>
          <View style={{ flex: 1 }}>
            <Button
              label={t("processPayoutNow")}
              onPress={onRetry}
              size="sm"
              loading={busy}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t("markManuallySettled")}
              variant="ghost"
              onPress={onMarkManual}
              size="sm"
            />
          </View>
        </View>
      ) : row.status === "manual_pending" ? (
        <View style={{ marginTop: 12 }}>
          <Button
            label={t("markManuallySettled")}
            variant="secondary"
            onPress={onMarkManual}
            size="sm"
            icon={<Feather name="check" size={14} color={c.primary} />}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  processBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  processText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
  },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  cardHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  meta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  pillText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  amountRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  amount: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  payoutType: { fontFamily: "Cairo_400Regular", fontSize: 11 },
  reason: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    marginTop: 8,
    textAlign: "right",
  },
  actionsRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 12,
  },
});
