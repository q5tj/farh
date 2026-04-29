import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  adminFetchPendingRefunds,
  adminMarkRefund,
  type Booking,
  type RefundStatus,
} from "@/lib/data";
import { useT } from "@/lib/i18n";

export default function AdminRefundsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [target, setTarget] = useState<{
    booking: Booking;
    next: RefundStatus;
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const list = await adminFetchPendingRefunds(lang);
      setBookings(list);
    } catch (e) {
      console.warn("[admin refunds] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await adminMarkRefund(target.booking.id, target.next, note.trim());
      setTarget(null);
      setNote("");
      await load();
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (Platform.OS !== "web") Alert.alert(t("error"), msg);
      else if (typeof window !== "undefined") window.alert(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("adminRefunds")}
        subtitle={t("adminRefundsDesc")}
      />

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : bookings.length === 0 ? (
        <EmptyState icon="check-circle" title={t("noPendingRefunds")} />
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
          {bookings.map((b) => (
            <RefundRow
              key={b.id}
              booking={b}
              onMark={(status) => {
                setNote("");
                setTarget({ booking: b, next: status });
              }}
            />
          ))}
        </ScrollView>
      )}

      <Modal
        visible={target !== null}
        transparent
        animationType="slide"
        onRequestClose={() => !busy && setTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalContainer}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.modalCard,
                { backgroundColor: c.background, borderRadius: c.radius },
              ]}
            >
              <Text style={[styles.modalTitle, { color: c.foreground }]}>
                {target?.next === "completed"
                  ? t("markRefundCompleted")
                  : t("markRefundFailed")}
              </Text>
              <Input
                label={t("refundNoteOptional")}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                style={{ height: 90, textAlignVertical: "top" }}
                maxLength={400}
              />
              <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={
                      target?.next === "completed"
                        ? t("markRefundCompleted")
                        : t("markRefundFailed")
                    }
                    onPress={submit}
                    loading={busy}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("cancel")}
                    variant="ghost"
                    onPress={() => !busy && setTarget(null)}
                  />
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </View>
  );
}

function RefundRow({
  booking,
  onMark,
}: {
  booking: Booking;
  onMark: (next: RefundStatus) => void;
}) {
  const c = useColors();
  const { t } = useT();
  const statusBg =
    booking.refundStatus === "failed" ? "#fee2e2" : "#fef3c7";
  const statusFg =
    booking.refundStatus === "failed" ? "#991b1b" : "#a16207";
  const statusLabel =
    booking.refundStatus === "failed"
      ? t("refundStatusFailed")
      : t("refundStatusPending");
  return (
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.foreground }]}>
            {booking.serviceTitle}
          </Text>
          <Text style={[styles.meta, { color: c.mutedForeground }]}>
            {booking.providerName ?? "—"} • {booking.userName} •{" "}
            {booking.price.toLocaleString()} {t("sar")}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: statusBg }]}>
          <Text style={[styles.pillText, { color: statusFg }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {booking.cancellationReason ? (
        <Text style={[styles.reason, { color: c.foreground }]}>
          {t("cancellationReasonLabel")}: {booking.cancellationReason}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            label={t("markRefundCompleted")}
            onPress={() => onMark("completed")}
            icon={<Feather name="check" size={16} color="#ffffff" />}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t("markRefundFailed")}
            onPress={() => onMark("failed")}
            variant="ghost"
            icon={<Feather name="x" size={16} color={c.destructive} />}
          />
        </View>
      </View>
    </Card>
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
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  pillText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  reason: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    marginTop: 10,
    textAlign: "right",
  },
  actions: {
    flexDirection: "row-reverse",
    gap: 10,
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
  },
  modalContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    padding: 20,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
    marginBottom: 14,
  },
});
