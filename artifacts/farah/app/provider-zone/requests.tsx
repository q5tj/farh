import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Booking, BookingStatus, useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";
import { isMapUrl, parseLocation } from "@/lib/location";
import {
  recordCompletion,
  type FinalPaymentMethod,
} from "@/lib/payments";

function formatDate(ms: number) {
  if (!ms) return "";
  const d = new Date(ms);
  const months = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function RequestsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { providerBookings, updateBookingStatus, refresh } = useApp();
  const [filter, setFilter] = useState<"all" | BookingStatus | "awaiting_final">(
    "pending",
  );
  const [completing, setCompleting] = useState<Booking | null>(null);

  // Filter set: the synthetic "awaiting_final" tab surfaces completed
  // bookings whose customer hasn't paid the remainder yet (online flow).
  type FilterId = "all" | BookingStatus | "awaiting_final";
  const [filterTyped] = [filter as FilterId];
  const FILTERS: { id: FilterId; label: string }[] = [
    { id: "all", label: t("all") },
    { id: "awaiting_final", label: t("filterAwaitingFinalPayment") },
    { id: "completed", label: t("statusCompleted") },
    { id: "accepted", label: t("statusAccepted") },
    { id: "pending", label: t("statusPending") },
  ];

  const filtered = useMemo(() => {
    if (filterTyped === "all") return providerBookings;
    if (filterTyped === "awaiting_final") {
      return providerBookings.filter(
        (b) =>
          b.finalPaymentMethod === "online" &&
          b.finalPaymentStatus === "pending",
      );
    }
    return providerBookings.filter((b) => b.status === filterTyped);
  }, [providerBookings, filterTyped]);

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/provider-zone");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("incomingRequests")}
        onBack={onBack}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 60 }}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? c.primary : c.muted,
                },
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
      </ScrollView>

      {filtered.length === 0 ? (
        <EmptyState icon="inbox" title={t("noRequestsInCategory")} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 12,
          }}
        >
          {filtered.map((b) => (
            <RequestCard
              key={b.id}
              booking={b}
              onChange={(s) => updateBookingStatus(b.id, s)}
              onComplete={() => setCompleting(b)}
            />
          ))}
        </ScrollView>
      )}

      <CompleteServiceModal
        booking={completing}
        onClose={() => setCompleting(null)}
        onDone={async () => {
          setCompleting(null);
          await refresh();
        }}
      />
    </View>
  );
}

function CompleteServiceModal({
  booking,
  onClose,
  onDone,
}: {
  booking: Booking | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const c = useColors();
  const { t } = useT();
  const [method, setMethod] = useState<FinalPaymentMethod>("online");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset method/note when a new booking is opened.
  React.useEffect(() => {
    if (booking) {
      setMethod("online");
      setNote("");
    }
  }, [booking?.id]);

  if (!booking) return null;

  const remaining = Math.max(
    0,
    booking.price - (booking.depositAmount ?? 0),
  );

  const submit = async () => {
    setBusy(true);
    try {
      await recordCompletion(booking.id, method, note);
      await onDone();
    } catch (e) {
      const msg = (e as Error)?.message ?? t("completionFailed");
      if (Platform.OS !== "web") Alert.alert(t("error"), msg);
      else if (typeof window !== "undefined") window.alert(msg);
    } finally {
      setBusy(false);
    }
  };

  const options: {
    id: FinalPaymentMethod;
    title: string;
    desc: string;
    icon: keyof typeof Feather.glyphMap;
  }[] = [
    {
      id: "online",
      title: t("methodOnlineTitle"),
      desc: t("methodOnlineDesc"),
      icon: "credit-card",
    },
    {
      id: "cash",
      title: t("methodCashTitle"),
      desc: t("methodCashDesc"),
      icon: "dollar-sign",
    },
    {
      id: "bank_transfer",
      title: t("methodBankTitle"),
      desc: t("methodBankDesc"),
      icon: "send",
    },
  ];

  return (
    <Modal
      visible={!!booking}
      transparent
      animationType="slide"
      onRequestClose={() => !busy && onClose()}
    >
      <View style={completionStyles.backdrop}>
        <KeyboardAwareScrollView
          contentContainerStyle={completionStyles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              completionStyles.card,
              { backgroundColor: c.background, borderRadius: c.radius },
            ]}
          >
            <Text style={[completionStyles.title, { color: c.foreground }]}>
              {t("completeServiceTitle")}
            </Text>
            <Text style={[completionStyles.desc, { color: c.mutedForeground }]}>
              {t("completeServiceDesc")}
            </Text>

            <View
              style={[
                completionStyles.summary,
                { backgroundColor: c.muted, borderColor: c.border },
              ]}
            >
              <View style={completionStyles.summaryRow}>
                <Text
                  style={[
                    completionStyles.summaryLabel,
                    { color: c.mutedForeground },
                  ]}
                >
                  {t("remainingAmountLabel")}
                </Text>
                <Text
                  style={[
                    completionStyles.summaryValue,
                    { color: c.foreground },
                  ]}
                >
                  {remaining.toLocaleString()} {t("sar")}
                </Text>
              </View>
            </View>

            <View style={{ gap: 10, marginTop: 4 }}>
              {options.map((opt) => {
                const active = method === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setMethod(opt.id)}
                    style={({ pressed }) => [
                      completionStyles.option,
                      {
                        borderColor: active ? c.primary : c.border,
                        backgroundColor: active ? c.primaryBg : c.background,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name={opt.icon}
                      size={18}
                      color={active ? c.primary : c.mutedForeground}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          completionStyles.optTitle,
                          { color: c.foreground },
                        ]}
                      >
                        {opt.title}
                      </Text>
                      <Text
                        style={[
                          completionStyles.optDesc,
                          { color: c.mutedForeground },
                        ]}
                      >
                        {opt.desc}
                      </Text>
                    </View>
                    <View
                      style={[
                        completionStyles.radio,
                        {
                          borderColor: active ? c.primary : c.border,
                          backgroundColor: active ? c.primary : "transparent",
                        },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>

            <Input
              label={t("completeNoteOptional")}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              style={{ height: 80, textAlignVertical: "top", marginTop: 14 }}
              maxLength={400}
            />

            <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("completeConfirm")}
                  onPress={submit}
                  loading={busy}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("cancel")}
                  variant="ghost"
                  onPress={() => !busy && onClose()}
                />
              </View>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

function RequestCard({
  booking,
  onChange,
  onComplete,
}: {
  booking: Booking;
  onChange: (s: BookingStatus) => void;
  onComplete: () => void;
}) {
  const c = useColors();
  const { t } = useT();
  return (
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.client, { color: c.foreground }]}>
            {booking.userName}
          </Text>
          <Text style={[styles.phone, { color: c.mutedForeground }]}>
            {booking.userPhone}
          </Text>
        </View>
        <StatusBadge status={booking.status} />
      </View>

      <Text style={[styles.service, { color: c.foreground }]}>
        {booking.serviceTitle}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Feather name="inbox" size={12} color={c.mutedForeground} />
          <Text style={[styles.meta, { color: c.mutedForeground }]}>
            {t("requestDateLabel")}: {formatDate(booking.createdAt)}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Feather name="calendar" size={12} color={c.mutedForeground} />
          <Text style={[styles.meta, { color: c.mutedForeground }]}>
            {t("eventDateLabel")}: {booking.date} • {booking.time}
          </Text>
        </View>
        <LocationLine location={booking.location} />
      </View>

      {booking.notes ? (
        <View style={[styles.notesBox, { backgroundColor: c.muted }]}>
          <Text style={[styles.notesText, { color: c.mutedForeground }]}>
            {booking.notes}
          </Text>
        </View>
      ) : null}

      <View style={styles.priceRow}>
        <Text style={[styles.priceLabel, { color: c.mutedForeground }]}>
          {t("amount")}
        </Text>
        <Text style={[styles.price, { color: c.primary }]}>
          {booking.price.toLocaleString()} {t("sar")}
        </Text>
      </View>

      {booking.depositPaidAt ? (
        <View
          style={[
            styles.depositSecured,
            { backgroundColor: c.muted, borderColor: c.border },
          ]}
        >
          <Feather name="shield" size={14} color={c.primary} />
          <Text style={[styles.depositText, { color: c.foreground }]}>
            {t("depositSecuredNotice")}
          </Text>
        </View>
      ) : null}

      {booking.finalPaymentMethod === "online" &&
      booking.finalPaymentStatus === "pending" ? (
        <View
          style={[
            styles.depositSecured,
            { backgroundColor: "#fef3c7", borderColor: "#fde68a" },
          ]}
        >
          <Feather name="clock" size={14} color="#a16207" />
          <Text style={[styles.depositText, { color: "#a16207" }]}>
            {t("finalPaymentPending")}
          </Text>
        </View>
      ) : null}

      {booking.finalPaymentStatus === "paid" &&
      booking.status === "completed" ? (
        <View
          style={[
            styles.depositSecured,
            { backgroundColor: "#dcfce7", borderColor: "#86efac" },
          ]}
        >
          <Feather name="check-circle" size={14} color="#15803d" />
          <Text style={[styles.depositText, { color: "#15803d" }]}>
            {booking.finalPaymentMethod === "online"
              ? t("finalPaymentPaid")
              : t("finalPaymentReceivedOffline", {
                  method:
                    booking.finalPaymentMethod === "cash"
                      ? t("methodCashTitle")
                      : t("methodBankTitle"),
                })}
          </Text>
        </View>
      ) : null}

      {booking.status === "pending" ? (
        <View style={styles.actionsRow}>
          <View style={{ flex: 1 }}>
            <Button label={t("acceptRequest")} onPress={() => onChange("accepted")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t("rejectRequest")}
              variant="ghost"
              onPress={() => onChange("rejected")}
            />
          </View>
        </View>
      ) : booking.status === "accepted" ? (
        <View style={{ marginTop: 14 }}>
          <Button
            label={t("markCompleted")}
            variant="secondary"
            onPress={onComplete}
          />
        </View>
      ) : null}
    </Card>
  );
}

function LocationLine({ location }: { location: string }) {
  const c = useColors();
  const { t } = useT();
  const parsed = parseLocation(location);
  const hasMap = parsed.mapUrl && isMapUrl(parsed.mapUrl);
  const openMap = () => {
    if (parsed.mapUrl) Linking.openURL(parsed.mapUrl).catch(() => {});
  };
  return (
    <View style={[styles.metaItem, { flexWrap: "wrap" }]}>
      <Feather name="map-pin" size={12} color={c.mutedForeground} />
      <Text
        style={[styles.meta, { color: c.mutedForeground }]}
        numberOfLines={1}
      >
        {parsed.city || parsed.raw}
      </Text>
      {hasMap ? (
        <Pressable
          onPress={openMap}
          style={({ pressed }) => [
            styles.mapLink,
            {
              backgroundColor: c.primaryBg,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather name="external-link" size={11} color={c.primary} />
          <Text style={[styles.mapLinkText, { color: c.primary }]}>
            {t("openInMaps")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: "row-reverse",
  },
  backBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 100,
    gap: 6,
  },
  backText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  client: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  phone: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
  },
  service: {
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    textAlign: "right",
    marginTop: 12,
  },
  metaRow: {
    flexDirection: "column",
    gap: 6,
    marginTop: 10,
  },
  metaItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  notesBox: { padding: 10, borderRadius: 10, marginTop: 10 },
  notesText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 19,
  },
  priceRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#ece4f5",
  },
  priceLabel: { fontFamily: "Cairo_500Medium", fontSize: 13 },
  price: { fontFamily: "Cairo_700Bold", fontSize: 17 },
  actionsRow: { flexDirection: "row-reverse", gap: 10, marginTop: 14 },
  mapLink: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginInlineStart: 6,
  },
  mapLinkText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  depositSecured: {
    marginTop: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  depositText: {
    flex: 1,
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 19,
  },
});

const completionStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    padding: 20,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
    marginBottom: 6,
  },
  desc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 20,
    marginBottom: 14,
  },
  summary: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: { fontFamily: "Cairo_500Medium", fontSize: 13 },
  summaryValue: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  option: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  optTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    textAlign: "right",
  },
  optDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
    lineHeight: 18,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    marginTop: 2,
  },
});
