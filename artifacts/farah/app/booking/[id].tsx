import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Stars } from "@/components/ui/Stars";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { COVER_BY_CATEGORY, DEFAULT_COVER } from "@/constants/seedData";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";
import {
  fetchBookingById,
  fetchProviderById,
  type Booking,
  type Provider,
} from "@/lib/data";
import { isMapUrl, parseLocation } from "@/lib/location";

export default function BookingDetailScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = String(id);
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";
  const { bookings, providerBookings, getProvider, updateBookingStatus } =
    useApp();

  const cachedBooking =
    bookings.find((b) => b.id === bookingId) ??
    providerBookings.find((b) => b.id === bookingId) ??
    null;
  const [booking, setBooking] = useState<Booking | null>(cachedBooking);
  const [provider, setProvider] = useState<Provider | null>(
    cachedBooking ? getProvider(cachedBooking.providerId) ?? null : null,
  );
  const [loading, setLoading] = useState(!cachedBooking);

  useEffect(() => {
    let alive = true;
    if (cachedBooking) {
      setBooking(cachedBooking);
      const cachedProvider = getProvider(cachedBooking.providerId);
      if (cachedProvider) {
        setProvider(cachedProvider);
      } else {
        fetchProviderById(cachedBooking.providerId, lang).then((p) => {
          if (alive) setProvider(p);
        });
      }
      setLoading(false);
      return () => {
        alive = false;
      };
    }
    setLoading(true);
    fetchBookingById(bookingId)
      .then(async (b) => {
        if (!alive) return;
        setBooking(b);
        if (b) {
          const p = getProvider(b.providerId);
          if (p) {
            setProvider(p);
          } else {
            const fetched = await fetchProviderById(b.providerId, lang);
            if (alive) setProvider(fetched);
          }
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [bookingId, cachedBooking, getProvider, lang]);

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

  if (!booking) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title={t("bookingDetails")} />
        <View style={{ padding: 24 }}>
          <Text style={{ color: c.foreground }}>الحجز غير موجود</Text>
        </View>
      </View>
    );
  }

  const cover = provider?.coverUrl
    ? { uri: provider.coverUrl }
    : COVER_BY_CATEGORY[provider?.categorySlug ?? ""] ?? DEFAULT_COVER;

  const cancelBooking = () => {
    const run = () => updateBookingStatus(booking.id, "cancelled");
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("هل تريد إلغاء الحجز؟")) run();
      return;
    }
    Alert.alert("إلغاء الحجز", "هل تريد فعلاً إلغاء هذا الحجز؟", [
      { text: "تراجع", style: "cancel" },
      { text: "نعم", style: "destructive", onPress: run },
    ]);
  };

  const canRate = booking.status === "completed" && booking.rating == null;
  const canCancel =
    booking.status === "pending" || booking.status === "accepted";

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("bookingDetails")} />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 100,
        }}
      >
        <Card padded={false} style={{ overflow: "hidden" }}>
          <Image source={cover} style={styles.cover} />
          <View style={{ padding: 16 }}>
            <View style={styles.row}>
              <Text style={[styles.providerName, { color: c.foreground }]}>
                {provider?.name ?? "—"}
              </Text>
              <StatusBadge status={booking.status} />
            </View>
            <Text style={[styles.serviceTitle, { color: c.mutedForeground }]}>
              {booking.serviceTitle}
            </Text>
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={[styles.sectionTitle, { color: c.foreground }]}>
            {t("eventDetails")}
          </Text>
          <View style={{ marginTop: 12, gap: 14 }}>
            <DetailRow icon="calendar" label={t("selectDate")} value={booking.date} />
            <DetailRow icon="clock" label={t("selectTime")} value={booking.time} />
            <LocationRow location={booking.location} />
            {booking.notes ? (
              <DetailRow icon="file-text" label={t("notes")} value={booking.notes} />
            ) : null}
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <View style={styles.row}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              {t("paymentSummary")}
            </Text>
            <PaymentBadge status={booking.paymentStatus} />
          </View>
          <View style={{ marginTop: 14, gap: 10 }}>
            <View style={styles.row}>
              <Text style={[styles.payLabel, { color: c.mutedForeground }]}>
                {t("servicePrice")}
              </Text>
              <Text style={[styles.payValue, { color: c.foreground }]}>
                {booking.price.toLocaleString()} {t("sar")}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <View style={styles.row}>
              <Text style={[styles.totalLabel, { color: c.foreground }]}>
                {t("total")}
              </Text>
              <Text style={[styles.totalValue, { color: c.primary }]}>
                {booking.price.toLocaleString()} {t("sar")}
              </Text>
            </View>
          </View>
        </Card>

        {booking.rating ? (
          <Card style={{ marginTop: 14 }}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              {t("rateService")}
            </Text>
            <View style={{ marginTop: 12, gap: 8 }}>
              <Stars value={booking.rating} size={20} />
              {booking.reviewText ? (
                <Text style={[styles.reviewText, { color: c.mutedForeground }]}>
                  {booking.reviewText}
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        <View style={{ marginTop: 18, gap: 10 }}>
          {provider?.phone ? (
            <Button
              label={t("contactProvider")}
              variant="secondary"
              onPress={() => Linking.openURL(`tel:${provider.phone}`)}
              icon={<Feather name="phone" size={16} color={c.primary} />}
            />
          ) : null}
          {canRate ? (
            <Button
              label={t("rate")}
              onPress={() => router.push(`/rate/${booking.id}`)}
              icon={<Feather name="star" size={16} color="#ffffff" />}
            />
          ) : null}
          {canCancel ? (
            <Button
              label={t("cancel")}
              variant="ghost"
              onPress={cancelBooking}
            />
          ) : null}

          <Button
            label={t("close")}
            variant="ghost"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)/bookings");
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function PaymentBadge({ status }: { status: "pending" | "paid" | "refunded" | "failed" }) {
  const c = useColors();
  const config = {
    pending: { label: "بانتظار الدفع", bg: "#fef3c7", fg: "#a16207" },
    paid: { label: "مدفوع", bg: "#dcfce7", fg: "#16a34a" },
    refunded: { label: "مُسترد", bg: "#dbeafe", fg: "#2563eb" },
    failed: { label: "فشل الدفع", bg: "#fee2e2", fg: c.destructive },
  }[status];
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
        backgroundColor: config.bg,
      }}
    >
      <Text style={{ color: config.fg, fontFamily: "Cairo_600SemiBold", fontSize: 11 }}>
        {config.label}
      </Text>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  const c = useColors();
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIcon, { backgroundColor: c.primaryBg }]}>
        <Feather name={icon} size={16} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.detailLabel, { color: c.mutedForeground }]}>
          {label}
        </Text>
        <Text style={[styles.detailValue, { color: c.foreground }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function LocationRow({ location }: { location: string }) {
  const c = useColors();
  const { t } = useT();
  const parsed = parseLocation(location);
  const hasMap = parsed.mapUrl && isMapUrl(parsed.mapUrl);
  const openMap = () => {
    if (parsed.mapUrl) Linking.openURL(parsed.mapUrl).catch(() => {});
  };
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIcon, { backgroundColor: c.primaryBg }]}>
        <Feather name="map-pin" size={16} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.detailLabel, { color: c.mutedForeground }]}>
          {t("location")}
        </Text>
        <Text style={[styles.detailValue, { color: c.foreground }]}>
          {parsed.city || parsed.raw}
        </Text>
        {hasMap ? (
          <Pressable
            onPress={openMap}
            style={({ pressed }) => [
              styles.openMapBtn,
              {
                backgroundColor: c.primaryBg,
                borderColor: c.primary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="external-link" size={13} color={c.primary} />
            <Text style={[styles.openMapText, { color: c.primary }]}>
              {t("openInMaps")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", height: 140 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  providerName: { fontFamily: "Cairo_700Bold", fontSize: 17, flex: 1, textAlign: "right" },
  serviceTitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    marginTop: 6,
    textAlign: "right",
  },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right" },
  detailRow: { flexDirection: "row-reverse", gap: 12, alignItems: "center" },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginBottom: 2,
    textAlign: "right",
  },
  detailValue: {
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    textAlign: "right",
  },
  payLabel: { fontFamily: "Cairo_400Regular", fontSize: 14 },
  payValue: { fontFamily: "Cairo_500Medium", fontSize: 14 },
  divider: { height: 1 },
  totalLabel: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  totalValue: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  reviewText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
  },
  openMapBtn: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  openMapText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
});
