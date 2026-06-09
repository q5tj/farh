import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import {
  AvailableSlot,
  fetchBookingById,
  fetchProviderById,
  fetchProviderBusyIntervals,
  generateSlots,
  weekdayKey,
  type Booking,
} from "@/lib/data";
import { infoDialog } from "@/lib/dialog";
import { formatTimeCompact } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { requestReschedule } from "@/lib/payments";

/**
 * Customer-side reschedule flow. Uses the SAME slot generator the
 * original booking did so the customer can only pick a slot that
 * actually opens against the provider's working hours, existing
 * bookings, and the provider's manual unavailable periods. The DB
 * does the final collision check too — see `request_reschedule`.
 *
 * Cut-off: the original booking must start more than 48 hours from
 * now. The CTA on /booking/[id] only opens this page when that's
 * the case, but we re-check here for safety.
 */
export default function RescheduleScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t, lang } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = String(id);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [provider, setProvider] = useState<Awaited<
    ReturnType<typeof fetchProviderById>
  > | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await fetchBookingById(bookingId, lang);
        if (!alive) return;
        setBooking(b);
        if (b) {
          const p = await fetchProviderById(b.providerId, lang);
          if (alive) setProvider(p);
        }
      } catch (e) {
        console.warn("[reschedule] load failed", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bookingId, lang]);

  // Default to a day a week ahead so the customer isn't picking the
  // same day they're trying to move away from.
  const initialDayIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const [dayIso, setDayIso] = useState(initialDayIso);

  const dayDate = useMemo(() => {
    const [y, m, d] = dayIso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [dayIso]);

  const [busy, setBusy] = useState<{ start: Date; end: Date }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!booking || !provider) return;
    let alive = true;
    setSlotsLoading(true);
    fetchProviderBusyIntervals(provider.id, dayDate, booking.serviceId)
      .then((b) => alive && setBusy(b))
      .catch(() => alive && setBusy([]))
      .finally(() => alive && setSlotsLoading(false));
    return () => {
      alive = false;
    };
  }, [provider?.id, booking?.serviceId, dayIso]);

  useEffect(() => {
    setSelectedSlot(null);
  }, [dayIso]);

  const service = provider?.services.find((s) => s.id === booking?.serviceId);

  const slots = useMemo(() => {
    if (!provider || !service) return [];
    const dayKey = weekdayKey(dayDate);
    return generateSlots({
      date: dayDate,
      workingHours: provider.workingHours[dayKey],
      durationMinutes: service.durationMinutes,
      busy,
      lang: lang as "ar" | "en",
    });
  }, [provider, service, dayDate, busy, lang]);

  const dayHasHours = useMemo(() => {
    if (!provider) return false;
    return provider.workingHours[weekdayKey(dayDate)] !== null;
  }, [provider, dayDate]);

  const submit = async () => {
    if (!booking || !selectedSlot) return;
    setSubmitting(true);
    try {
      await requestReschedule({
        bookingId: booking.id,
        newStart: selectedSlot.start,
        newEnd: selectedSlot.end,
      });
      await infoDialog({
        title: t("rescheduleSentTitle"),
        message: t("rescheduleSentBody"),
      });
      router.replace(`/booking/${booking.id}`);
    } catch (e) {
      const msg = (e as Error)?.message ?? t("rescheduleFailed");
      const friendly =
        msg.includes("slot_taken") || msg.includes("slot_blocked")
          ? t("rescheduleSlotConflict")
          : msg.includes("reschedule_too_late")
            ? t("rescheduleTooLate")
            : msg.includes("reschedule_already_pending")
              ? t("rescheduleAlreadyPending")
              : msg;
      await infoDialog({ title: t("error"), message: friendly });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title={t("rescheduleTitle")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      </View>
    );
  }

  if (!booking || !provider || !service) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title={t("rescheduleTitle")} />
        <View style={{ padding: 24 }}>
          <Text style={{ color: c.foreground }}>{t("bookingNotFound")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("rescheduleTitle")} subtitle={booking.serviceTitle} />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 140,
        }}
      >
        <Card>
          <Text style={[styles.label, { color: c.foreground }]}>
            {t("rescheduleCurrentTime")}
          </Text>
          <Text style={[styles.muted, { color: c.mutedForeground }]}>
            {new Date(booking.startAt).toLocaleString()}
          </Text>
        </Card>

        <View style={{ marginTop: 14 }}>
          <Text style={[styles.label, { color: c.foreground, marginBottom: 8 }]}>
            {t("pickNewDate")}
          </Text>
          <Calendar value={dayIso} onChange={setDayIso} />
        </View>

        <View style={{ marginTop: 14 }}>
          <Text style={[styles.label, { color: c.foreground, marginBottom: 8 }]}>
            {t("pickNewTime")}
          </Text>
          {slotsLoading ? (
            <View style={{ paddingVertical: 18, alignItems: "center" }}>
              <ActivityIndicator color={c.primary} />
            </View>
          ) : !dayHasHours ? (
            <Text style={[styles.muted, { color: c.mutedForeground }]}>
              {t("providerOffToday")}
            </Text>
          ) : slots.length === 0 ? (
            <Text style={[styles.muted, { color: c.mutedForeground }]}>
              {t("noAvailableSlots")}
            </Text>
          ) : (
            <View style={styles.timesGrid}>
              {slots.map((slot) => {
                const active =
                  selectedSlot?.start.getTime() === slot.start.getTime();
                return (
                  <Pressable
                    key={slot.start.toISOString()}
                    onPress={() => setSelectedSlot(slot)}
                    style={[
                      styles.timeChip,
                      {
                        backgroundColor: active ? c.primary : c.card,
                        borderColor: active ? c.primary : c.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.timeChipText,
                        {
                          color: active ? "#ffffff" : c.foreground,
                          fontFamily: active
                            ? "Cairo_700Bold"
                            : "Cairo_500Medium",
                        },
                      ]}
                    >
                      {formatTimeCompact(slot.start, lang as "ar" | "en")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: c.background,
            borderTopColor: c.border,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <Text style={[styles.footerNote, { color: c.mutedForeground }]}>
          <Feather name="info" size={11} /> {t("rescheduleNote")}
        </Text>
        <Button
          label={t("submitReschedule")}
          onPress={submit}
          loading={submitting}
          disabled={!selectedSlot}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  muted: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    marginTop: 6,
    lineHeight: 19,
  },
  timesGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  timeChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 76,
    alignItems: "center",
  },
  timeChipText: { fontSize: 12 },
  footer: {
    position: "absolute",
    right: 0,
    left: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  footerNote: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    textAlign: "right",
    lineHeight: 17,
  },
});
