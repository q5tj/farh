import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
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
import { COVER_BY_CATEGORY } from "@/constants/seedData";
import { STRINGS } from "@/constants/strings";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

export default function BookingDetailScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bookings, getProvider, updateBookingStatus } = useApp();
  const booking = bookings.find((b) => b.id === String(id));
  const provider = booking ? getProvider(booking.providerId) : null;

  if (!booking || !provider) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title="تفاصيل الحجز" />
        <View style={{ padding: 24 }}>
          <Text style={{ color: c.foreground }}>الحجز غير موجود</Text>
        </View>
      </View>
    );
  }

  const cover = COVER_BY_CATEGORY[provider.categoryId];

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
      <ScreenHeader title="تفاصيل الحجز" />
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
                {provider.name}
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
            تفاصيل المناسبة
          </Text>
          <View style={{ marginTop: 12, gap: 14 }}>
            <DetailRow icon="calendar" label={STRINGS.selectDate} value={booking.date} />
            <DetailRow icon="clock" label={STRINGS.selectTime} value={booking.time} />
            <DetailRow icon="map-pin" label={STRINGS.location} value={booking.location} />
            {booking.notes ? (
              <DetailRow icon="file-text" label={STRINGS.notes} value={booking.notes} />
            ) : null}
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <View style={styles.row}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              ملخص الدفع
            </Text>
          </View>
          <View style={{ marginTop: 14, gap: 10 }}>
            <View style={styles.row}>
              <Text style={[styles.payLabel, { color: c.mutedForeground }]}>
                سعر الخدمة
              </Text>
              <Text style={[styles.payValue, { color: c.foreground }]}>
                {booking.price.toLocaleString()} {STRINGS.sar}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <View style={styles.row}>
              <Text style={[styles.totalLabel, { color: c.foreground }]}>
                الإجمالي
              </Text>
              <Text style={[styles.totalValue, { color: c.primary }]}>
                {booking.price.toLocaleString()} {STRINGS.sar}
              </Text>
            </View>
          </View>
        </Card>

        {booking.rating ? (
          <Card style={{ marginTop: 14 }}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              تقييمك للخدمة
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
          <Button
            label={STRINGS.contactProvider}
            variant="secondary"
            onPress={() => Linking.openURL(`tel:${provider.phone}`)}
            icon={<Feather name="phone" size={16} color={c.primary} />}
          />
          {canRate ? (
            <Button
              label={STRINGS.rate}
              onPress={() => router.push(`/rate/${booking.id}`)}
              icon={<Feather name="star" size={16} color="#ffffff" />}
            />
          ) : null}
          {canCancel ? (
            <Button
              label={STRINGS.cancel}
              variant="ghost"
              onPress={cancelBooking}
            />
          ) : null}
        </View>
      </ScrollView>
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

const styles = StyleSheet.create({
  cover: { width: "100%", height: 140 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  providerName: { fontFamily: "Inter_700Bold", fontSize: 17, flex: 1, textAlign: "right" },
  serviceTitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 6,
    textAlign: "right",
  },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 15, textAlign: "right" },
  detailRow: { flexDirection: "row-reverse", gap: 12, alignItems: "center" },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 2,
    textAlign: "right",
  },
  detailValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    textAlign: "right",
  },
  payLabel: { fontFamily: "Inter_400Regular", fontSize: 14 },
  payValue: { fontFamily: "Inter_500Medium", fontSize: 14 },
  divider: { height: 1 },
  totalLabel: { fontFamily: "Inter_700Bold", fontSize: 15 },
  totalValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  reviewText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
  },
});
