import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { CITIES } from "@/constants/seedData";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  AvailableSlot,
  fetchProviderBusyIntervals,
  fetchProviderById,
  formatTimeAr,
  generateSlots,
  weekdayKey,
  SLOT_TAKEN_ERROR,
  type Provider,
} from "@/lib/data";
import { useT } from "@/lib/i18n";
import { getCurrentMapUrl, isMapUrl } from "@/lib/location";

function getNextDays(count: number) {
  const arr: { label: string; sub: string; iso: string; date: Date }[] = [];
  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const today = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    d.setHours(0, 0, 0, 0);
    arr.push({
      label: `${d.getDate()} ${months[d.getMonth()]}`,
      sub: days[d.getDay()],
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      date: d,
    });
  }
  return arr;
}

export default function BookingFormScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { providerId, serviceId } = useLocalSearchParams<{
    providerId: string;
    serviceId: string;
  }>();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";
  const { getProvider, addBooking } = useApp();
  const cached = getProvider(String(providerId));
  const [provider, setProvider] = useState<Provider | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetchProviderById(String(providerId), lang)
      .then((p) => {
        if (alive) setProvider(p);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [providerId, lang, cached]);

  const service = provider?.services.find((s) => s.id === String(serviceId));

  const days = useMemo(() => getNextDays(14), []);
  const [selectedDayIso, setSelectedDayIso] = useState(days[1]?.iso ?? "");
  const selectedDay = useMemo(
    () => days.find((d) => d.iso === selectedDayIso) ?? days[0],
    [days, selectedDayIso],
  );

  // Available slots for the selected day
  const [busy, setBusy] = useState<{ start: Date; end: Date }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

  // Refresh busy intervals when provider/day changes
  useEffect(() => {
    if (!provider || !selectedDay) return;
    let alive = true;
    setSlotsLoading(true);
    fetchProviderBusyIntervals(provider.id, selectedDay.date)
      .then((intervals) => {
        if (alive) setBusy(intervals);
      })
      .catch(() => {
        if (alive) setBusy([]);
      })
      .finally(() => {
        if (alive) setSlotsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [provider, selectedDay]);

  // Reset selected slot when day changes
  useEffect(() => {
    setSelectedSlot(null);
  }, [selectedDayIso]);

  const slots = useMemo(() => {
    if (!provider || !service || !selectedDay) return [];
    const dayKey = weekdayKey(selectedDay.date);
    const hours = provider.workingHours[dayKey];
    return generateSlots({
      date: selectedDay.date,
      workingHours: hours,
      durationMinutes: service.durationMinutes,
      busy,
    });
  }, [provider, service, selectedDay, busy]);

  const [city, setCity] = useState(provider?.city || CITIES[0]);
  const [mapUrl, setMapUrl] = useState("");
  const [mapError, setMapError] = useState("");
  const [locating, setLocating] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Sync default city once provider loads
  useEffect(() => {
    if (provider?.city) setCity(provider.city);
  }, [provider?.city]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!provider || !service) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title={t("newBooking")} />
        <View style={{ padding: 24 }}>
          <Text style={{ color: c.foreground }}>{t("serviceNotAvailable")}</Text>
        </View>
      </View>
    );
  }

  const onUseCurrentLocation = async () => {
    setLocating(true);
    setMapError("");
    try {
      const { url } = await getCurrentMapUrl();
      setMapUrl(url);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setMapError(
        msg.includes("permission") || msg.includes("denied")
          ? t("locationDenied")
          : t("bookingCreateFailed"),
      );
    } finally {
      setLocating(false);
    }
  };

  const onPreviewMap = () => {
    if (mapUrl && isMapUrl(mapUrl)) {
      Linking.openURL(mapUrl).catch(() => {});
    }
  };

  const validateAndOpenConfirm = () => {
    if (!selectedSlot) {
      const msg = t("pickAvailableTime");
      if (Platform.OS !== "web") Alert.alert(t("required"), msg);
      else if (typeof window !== "undefined") window.alert(msg);
      return;
    }
    const trimmed = mapUrl.trim();
    if (!trimmed || !isMapUrl(trimmed)) {
      setMapError(t("locationRequired"));
      if (Platform.OS !== "web") {
        Alert.alert(t("required"), t("locationRequired"));
      }
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    try {
      const booking = await addBooking({
        providerId: provider.id,
        serviceId: service.id,
        serviceTitle: service.title,
        price: service.price,
        startAt: selectedSlot.start,
        endAt: selectedSlot.end,
        city,
        address: mapUrl.trim(),
        notes,
      });
      setConfirmOpen(false);
      router.replace(`/booking/${booking.id}`);
    } catch (e) {
      const err = e as Error;
      const isSlotTaken = err?.message === SLOT_TAKEN_ERROR;
      const msg = isSlotTaken
        ? t("slotTaken")
        : err?.message ?? t("bookingCreateFailed");
      setConfirmOpen(false);
      if (isSlotTaken) {
        // Refetch busy intervals so the slot is filtered out
        try {
          const intervals = await fetchProviderBusyIntervals(provider.id, selectedDay.date);
          setBusy(intervals);
          setSelectedSlot(null);
        } catch {
          // ignore
        }
      }
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(msg);
      } else {
        Alert.alert(t("error"), msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const dayHasHours = useMemo(() => {
    if (!selectedDay) return false;
    return provider.workingHours[weekdayKey(selectedDay.date)] !== null;
  }, [provider, selectedDay]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("newBooking")} subtitle={provider.name} />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 140,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={140}
      >
        <Card>
          <View style={styles.headRow}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: c.primaryBg },
              ]}
            >
              <Feather name="check-square" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.serviceTitle, { color: c.foreground }]}>
                {service.title}
              </Text>
              <Text style={[styles.serviceDur, { color: c.mutedForeground }]}>
                {service.duration || `${service.durationMinutes} دقيقة`}
              </Text>
            </View>
            <Text style={[styles.servicePrice, { color: c.primary }]}>
              {service.price.toLocaleString()} {t("sar")}
            </Text>
          </View>
        </Card>

        <Text style={[styles.label, { color: c.foreground }]}>
          {t("selectDate")}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
        >
          {days.map((d) => {
            const active = selectedDayIso === d.iso;
            return (
              <Pressable
                key={d.iso}
                onPress={() => setSelectedDayIso(d.iso)}
                style={[
                  styles.dateChip,
                  {
                    backgroundColor: active ? c.primary : c.muted,
                    borderRadius: 14,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dateChipDay,
                    { color: active ? "#ffffff" : c.foreground },
                  ]}
                >
                  {d.label}
                </Text>
                <Text
                  style={[
                    styles.dateChipSub,
                    { color: active ? "rgba(255,255,255,0.85)" : c.mutedForeground },
                  ]}
                >
                  {d.sub}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[styles.label, { color: c.foreground }]}>
          {t("selectTime")}
        </Text>

        {slotsLoading ? (
          <View style={{ paddingVertical: 18, alignItems: "center" }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : !dayHasHours ? (
          <Text style={[styles.helperText, { color: c.mutedForeground }]}>
            المزود لا يعمل في هذا اليوم — اختر يوماً آخر.
          </Text>
        ) : slots.length === 0 ? (
          <Text style={[styles.helperText, { color: c.mutedForeground }]}>
            لا توجد مواعيد متاحة في هذا اليوم. جرّب يوماً آخر.
          </Text>
        ) : (
          <View style={styles.timesGrid}>
            {slots.map((slot) => {
              const active = selectedSlot?.start.getTime() === slot.start.getTime();
              return (
                <Pressable
                  key={slot.start.toISOString()}
                  onPress={() => setSelectedSlot(slot)}
                  style={[
                    styles.timeChip,
                    {
                      backgroundColor: active ? c.primaryBg : c.background,
                      borderColor: active ? c.primary : c.border,
                      borderRadius: 12,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.timeChipText,
                      {
                        color: active ? c.primary : c.foreground,
                        fontFamily: active
                          ? "Cairo_700Bold"
                          : "Cairo_500Medium",
                      },
                    ]}
                  >
                    {slot.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={[styles.label, { color: c.foreground }]}>
          {t("cityLabel")}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
        >
          {CITIES.map((cityName) => {
            const active = city === cityName;
            return (
              <Pressable
                key={cityName}
                onPress={() => setCity(cityName)}
                style={[
                  styles.cityChip,
                  {
                    backgroundColor: active ? c.primary : c.muted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.cityChipText,
                    { color: active ? "#ffffff" : c.foreground },
                  ]}
                >
                  {cityName}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[styles.label, { color: c.foreground }]}>
          {t("location")}
        </Text>
        <Text style={[styles.helperText, { color: c.mutedForeground }]}>
          {t("locationHint")}
        </Text>

        <View style={{ marginTop: 12 }}>
          <Input
            placeholder={t("locationPlaceholder")}
            value={mapUrl}
            onChangeText={(t) => {
              setMapUrl(t);
              setMapError("");
            }}
            autoCapitalize="none"
            keyboardType="url"
            error={mapError}
            rightIcon={<Feather name="map-pin" size={16} color={c.mutedForeground} />}
          />
        </View>

        <View style={styles.locationActions}>
          <Pressable
            onPress={onUseCurrentLocation}
            disabled={locating}
            style={({ pressed }) => [
              styles.locBtn,
              {
                backgroundColor: c.primaryBg,
                borderColor: c.primary,
                opacity: pressed || locating ? 0.7 : 1,
              },
            ]}
          >
            <Feather
              name={locating ? "loader" : "navigation"}
              size={14}
              color={c.primary}
            />
            <Text style={[styles.locBtnText, { color: c.primary }]}>
              {locating ? t("fetchingLocation") : t("useCurrentLocation")}
            </Text>
          </Pressable>
          {mapUrl && isMapUrl(mapUrl) ? (
            <Pressable
              onPress={onPreviewMap}
              style={({ pressed }) => [
                styles.locBtn,
                {
                  backgroundColor: c.muted,
                  borderColor: c.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather name="external-link" size={14} color={c.foreground} />
              <Text style={[styles.locBtnText, { color: c.foreground }]}>
                {t("openInMaps")}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.label, { color: c.foreground }]}>{t("notes")}</Text>
        <View
          style={[
            styles.notesWrap,
            {
              backgroundColor: c.background,
              borderColor: c.border,
              borderRadius: c.radius - 4,
            },
          ]}
        >
          <Input
            placeholder={t("notesPlaceholder")}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            style={{ height: 100, textAlignVertical: "top" }}
          />
        </View>
      </KeyboardAwareScrollView>

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
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: c.mutedForeground }]}>
            {t("total")}
          </Text>
          <Text style={[styles.totalValue, { color: c.foreground }]}>
            {service.price.toLocaleString()} {t("sar")}
          </Text>
        </View>
        <Button
          label={t("submitBooking")}
          onPress={validateAndOpenConfirm}
          size="lg"
          disabled={!selectedSlot}
        />
      </View>

      {/* Confirmation modal */}
      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !submitting && setConfirmOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: c.background,
                borderRadius: c.radius,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: c.foreground }]}>
              {t("bookingConfirmTitle")}
            </Text>
            <Text style={[styles.modalDesc, { color: c.mutedForeground }]}>
              {t("bookingConfirmDesc")}
            </Text>
            <View style={{ marginTop: 16, gap: 10 }}>
              <SummaryRow label={t("serviceLabel")} value={service.title} />
              <SummaryRow label={t("providerLabel")} value={provider.name} />
              <SummaryRow
                label={t("dateLabel")}
                value={`${selectedDay?.label ?? ""} ${selectedDay?.sub ?? ""}`}
              />
              {selectedSlot ? (
                <SummaryRow
                  label={t("timeLabel")}
                  value={`${formatTimeAr(selectedSlot.start)} – ${formatTimeAr(selectedSlot.end)}`}
                />
              ) : null}
              <SummaryRow label={t("cityLabel")} value={city} />
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <SummaryRow
                label={t("total")}
                value={`${service.price.toLocaleString()} ${t("sar")}`}
                highlight
              />
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("confirmSend")}
                  onPress={submit}
                  loading={submitting}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("cancel")}
                  variant="ghost"
                  onPress={() => !submitting && setConfirmOpen(false)}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
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
          {
            color: highlight ? c.primary : c.foreground,
            fontFamily: highlight ? "Cairo_700Bold" : "Cairo_600SemiBold",
            fontSize: highlight ? 16 : 14,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  serviceDur: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 3,
    textAlign: "right",
  },
  servicePrice: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    marginTop: 22,
    marginBottom: 6,
    textAlign: "right",
  },
  helperText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    marginTop: 6,
    textAlign: "right",
    lineHeight: 19,
  },
  dateChip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    minWidth: 80,
  },
  dateChipDay: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  dateChipSub: { fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 3 },
  timesGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
  },
  timeChipText: { fontSize: 13 },
  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  cityChipText: { fontFamily: "Cairo_500Medium", fontSize: 13 },
  locationActions: {
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap",
  },
  locBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  locBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  notesWrap: { borderWidth: 1, padding: 0 },
  footer: {
    position: "absolute",
    right: 0,
    left: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  totalRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  totalLabel: { fontFamily: "Cairo_500Medium", fontSize: 14 },
  totalValue: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { padding: 22 },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    textAlign: "right",
  },
  modalDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    marginTop: 4,
    textAlign: "right",
  },
  summaryRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: { fontFamily: "Cairo_400Regular", fontSize: 13 },
  summaryValue: { textAlign: "left" },
  divider: { height: 1, marginVertical: 4 },
});
