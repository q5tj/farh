import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

import { BookingSuccessOverlay } from "@/components/BookingSuccessOverlay";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { Card } from "@/components/ui/Card";
import { CityPicker } from "@/components/ui/CityPicker";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { CITIES, localizedCityName } from "@/constants/seedData";
import { checkBookingLocation } from "@/lib/cities-geo";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  AvailableSlot,
  fetchPaymentSettings,
  fetchProviderBusyIntervals,
  fetchProviderById,
  fetchProviderServiceAreas,
  formatTimeAr,
  generateSlots,
  weekdayKey,
  SLOT_TAKEN_ERROR,
  type PaymentSettings,
  type Provider,
} from "@/lib/data";
import { formatShortDate, formatWeekday } from "@/lib/date-format";
import { useT } from "@/lib/i18n";
import {
  extractCoordsFromMapUrl,
  getCurrentMapUrl,
  isMapUrl,
} from "@/lib/location";
import {
  createBookingDepositPaymentRow,
  createMoyasarInvoice,
} from "@/lib/payments";

function getNextDays(
  count: number,
  t: (k: import("@/locales/ar").StringKey) => string,
  lang: string,
) {
  const arr: { label: string; sub: string; iso: string; date: Date }[] = [];
  const today = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    d.setHours(0, 0, 0, 0);
    arr.push({
      label: formatShortDate(d, t, lang),
      sub: formatWeekday(d, t),
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      date: d,
    });
  }
  return arr;
}

export default function BookingFormScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t, lang } = useT();
  const { providerId, serviceId } = useLocalSearchParams<{
    providerId: string;
    serviceId: string;
  }>();
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

  // Fetch the active payment-policy percentages so we can show the
  // customer the deposit / app-fee breakdown before they commit.
  const [paySettings, setPaySettings] = useState<PaymentSettings | null>(null);
  useEffect(() => {
    let alive = true;
    fetchPaymentSettings()
      .then((s) => {
        if (alive) setPaySettings(s);
      })
      .catch((e) => console.warn("[booking-form] payment settings", e));
    return () => {
      alive = false;
    };
  }, []);

  // Provider's extra service areas (the primary city is on `provider.city`).
  const [providerAreas, setProviderAreas] = useState<string[]>([]);
  useEffect(() => {
    if (!provider?.id) return;
    let alive = true;
    fetchProviderServiceAreas(provider.id)
      .then((areas) => {
        if (alive) setProviderAreas(areas);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [provider?.id]);

  const breakdown = useMemo(() => {
    if (!service || !paySettings) return null;
    const price = service.price;
    const deposit = Math.round((price * paySettings.depositPercentage) / 100);
    const appShare = Math.round(
      (deposit * paySettings.appShareFromDeposit) / 100,
    );
    const remaining = price - deposit;
    return {
      price,
      deposit,
      appShare,
      remaining,
      depositPct: paySettings.depositPercentage,
      appSharePct: paySettings.appShareFromDeposit,
      fullDays: paySettings.cancellationWindowFullDays,
      halfDays: paySettings.cancellationWindowHalfDays,
    };
  }, [service, paySettings]);

  const days = useMemo(() => getNextDays(14, t, lang), [t, lang]);
  const availableIsoSet = useMemo(
    () => new Set(days.map((d) => d.iso)),
    [days],
  );
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
  const [locationWarning, setLocationWarning] = useState<{
    kind: "mismatch" | "outsideAreas";
    selected: string;
    detected?: string;
    areas?: string[];
  } | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const successTargetRef = useRef<string | null>(null);
  // useRef lock — survives multiple state updates from rapid taps. State-only
  // locks have a render-cycle gap that allows double-submit on slow devices.
  const submitLock = useRef(false);

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

  const validateAndOpenConfirm = (skipLocationWarn = false) => {
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

    if (!skipLocationWarn && provider) {
      const check = checkBookingLocation({
        selectedCity: city,
        mapCoords: extractCoordsFromMapUrl(trimmed),
        providerCity: provider.city,
        providerServiceAreas: providerAreas,
      });
      if (!check.cityInServiceAreas) {
        const allAreas = [provider.city, ...providerAreas];
        setLocationWarning({
          kind: "outsideAreas",
          selected: city,
          areas: allAreas,
        });
        return;
      }
      if (!check.cityMatchesUrl && check.detectedCity) {
        setLocationWarning({
          kind: "mismatch",
          selected: city,
          detected: check.detectedCity,
        });
        return;
      }
    }

    setConfirmOpen(true);
  };

  const submit = async () => {
    if (!selectedSlot) return;
    if (submitLock.current) return; // hard-block re-entry
    submitLock.current = true;
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

      // Kick off the deposit payment flow. We create a pending DB row
      // (validates ownership + computes deposit), then ask the edge
      // function for a Moyasar hosted invoice URL, then send the user
      // there. Moyasar redirects them back to /payment/return where we
      // verify the result and route into /booking/:id.
      try {
        const paymentId = await createBookingDepositPaymentRow(booking.id);
        const origin =
          Platform.OS === "web" && typeof window !== "undefined"
            ? window.location.origin
            : "https://farh-app.vercel.app"; // TODO: real native deep-link
        const callbackUrl = `${origin}/payment/return?payment_id=${paymentId}&booking_id=${booking.id}`;
        const { invoice_url } = await createMoyasarInvoice(
          paymentId,
          callbackUrl,
        );
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.location.href = invoice_url;
        } else {
          await Linking.openURL(invoice_url);
        }
      } catch (payErr) {
        console.warn("[booking] deposit payment init failed", payErr);
        // Booking already exists; surface the failure but still let the
        // user open the booking detail to retry payment from there.
        const msg = (payErr as Error)?.message ?? t("paymentInitFailed");
        if (Platform.OS === "web") {
          if (typeof window !== "undefined") window.alert(msg);
        } else {
          Alert.alert(t("error"), msg);
        }
        successTargetRef.current = `/booking/${booking.id}`;
        setSuccessOpen(true);
      }
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
      submitLock.current = false;
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

        <View style={{ marginTop: 8 }}>
          <Text style={[styles.label, { color: c.foreground, marginBottom: 10 }]}>
            {t("pickDateAndTime")}
          </Text>

          <Calendar
            value={selectedDayIso}
            onChange={(iso) => setSelectedDayIso(iso)}
            availableDays={availableIsoSet}
          />

          <Text
            style={[
              styles.calSubLabel,
              { color: c.mutedForeground, marginTop: 16 },
            ]}
          >
            {t("availableTimesFor", { date: selectedDay?.label ?? "" })}
          </Text>

          {slotsLoading ? (
            <View style={{ paddingVertical: 18, alignItems: "center" }}>
              <ActivityIndicator color={c.primary} />
            </View>
          ) : !dayHasHours ? (
            <Text style={[styles.helperText, { color: c.mutedForeground }]}>
              {t("providerOffToday")}
            </Text>
          ) : slots.length === 0 ? (
            <Text style={[styles.helperText, { color: c.mutedForeground }]}>
              {t("noAvailableSlots")}
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
        </View>

        <View style={{ marginTop: 8 }}>
          <CityPicker
            label={t("cityLabel")}
            value={city}
            onChange={setCity}
          />
        </View>

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
              {breakdown ? (
                <>
                  <SummaryRow
                    label={t("depositNow", { percent: breakdown.depositPct })}
                    value={`${breakdown.deposit.toLocaleString()} ${t("sar")}`}
                    highlight
                  />
                  <SummaryRow
                    label={t("remainingToProvider")}
                    value={`${breakdown.remaining.toLocaleString()} ${t("sar")}`}
                  />
                  <Text
                    style={{
                      fontFamily: "Cairo_400Regular",
                      fontSize: 11,
                      color: c.mutedForeground,
                      lineHeight: 18,
                      textAlign: "right",
                      marginTop: 6,
                    }}
                  >
                    {t("platformFeeNotice", { percent: breakdown.appSharePct })}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Cairo_400Regular",
                      fontSize: 11,
                      color: c.mutedForeground,
                      lineHeight: 18,
                      textAlign: "right",
                    }}
                  >
                    {t("paymentHeldNotice")}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Cairo_400Regular",
                      fontSize: 11,
                      color: c.mutedForeground,
                      lineHeight: 18,
                      textAlign: "right",
                    }}
                  >
                    {t("cancellationPolicySummary", {
                      full: breakdown.fullDays,
                      half: breakdown.halfDays,
                    })}
                  </Text>
                </>
              ) : null}
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

      <BookingSuccessOverlay
        visible={successOpen}
        onDismiss={() => {
          setSuccessOpen(false);
          const target = successTargetRef.current;
          successTargetRef.current = null;
          if (target) router.replace(target as never);
        }}
      />

      <Modal
        visible={!!locationWarning}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationWarning(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: c.background, borderRadius: c.radius, padding: 22 },
            ]}
          >
            <View
              style={{
                alignItems: "center",
                gap: 6,
                marginBottom: 14,
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#fef3c7",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="alert-triangle" size={26} color="#a16207" />
              </View>
              <Text style={[styles.modalTitle, { color: c.foreground, textAlign: "center" }]}>
                {locationWarning?.kind === "mismatch"
                  ? t("cityMismatchTitle")
                  : t("cityOutsideAreasTitle", {
                      city: localizedCityName(
                        locationWarning?.selected ?? "",
                        lang,
                      ),
                    })}
              </Text>
            </View>
            <Text style={[styles.modalDesc, { color: c.mutedForeground, textAlign: "center" }]}>
              {locationWarning?.kind === "mismatch"
                ? t("cityMismatchBody", {
                    selected: localizedCityName(
                      locationWarning.selected,
                      lang,
                    ),
                    detected: localizedCityName(
                      locationWarning.detected ?? "",
                      lang,
                    ),
                  })
                : t("cityOutsideAreasBody", {
                    areas: (locationWarning?.areas ?? [])
                      .map((a) => localizedCityName(a, lang))
                      .join("، "),
                  })}
            </Text>
            <View style={{ gap: 10, marginTop: 4 }}>
              <Button
                label={t("changeCity")}
                onPress={() => setLocationWarning(null)}
                size="lg"
              />
              <Button
                label={t("cityOutsideAreasContinue")}
                variant="ghost"
                onPress={() => {
                  setLocationWarning(null);
                  validateAndOpenConfirm(true);
                }}
              />
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
  calSubLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    marginBottom: 10,
    textAlign: "right",
  },
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
