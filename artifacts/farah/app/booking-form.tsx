import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
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
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { CITIES } from "@/constants/seedData";
import { STRINGS } from "@/constants/strings";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const TIME_SLOTS = [
  "ظهراً 12:00",
  "عصراً 03:00",
  "مساءً 06:00",
  "مساءً 08:00",
  "ليلاً 10:00",
];

function getNextDays(count: number) {
  const arr: { label: string; sub: string; iso: string }[] = [];
  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const today = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    arr.push({
      label: `${d.getDate()} ${months[d.getMonth()]}`,
      sub: days[d.getDay()],
      iso: d.toISOString().slice(0, 10),
    });
  }
  return arr;
}

export default function BookingFormScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { providerId, serviceId } = useLocalSearchParams<{
    providerId: string;
    serviceId: string;
  }>();
  const { user } = useAuth();
  const { getProvider, addBooking } = useApp();
  const provider = getProvider(String(providerId));
  const service = provider?.services.find((s) => s.id === String(serviceId));

  const days = useMemo(() => getNextDays(14), []);
  const [date, setDate] = useState(days[1]?.iso ?? "");
  const [time, setTime] = useState(TIME_SLOTS[2]);
  const [city, setCity] = useState(provider?.city ?? CITIES[0]);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!provider || !service) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title={STRINGS.newBooking} />
        <View style={{ padding: 24 }}>
          <Text style={{ color: c.foreground }}>الخدمة غير متوفرة</Text>
        </View>
      </View>
    );
  }

  const submit = async () => {
    if (!address.trim()) {
      Alert.alert("مطلوب", "الرجاء إدخال الموقع");
      return;
    }
    setSubmitting(true);
    const booking = await addBooking({
      userId: user?.id ?? "guest",
      userName: user?.name ?? "ضيف",
      userPhone: user?.phone ?? "",
      providerId: provider.id,
      serviceId: service.id,
      serviceTitle: service.title,
      price: service.price,
      date,
      time,
      location: `${city} - ${address}`,
      notes,
    });
    setSubmitting(false);
    router.replace(`/booking/${booking.id}`);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <ScreenHeader title={STRINGS.newBooking} subtitle={provider.name} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 110 }}
        keyboardShouldPersistTaps="handled"
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
                {service.duration}
              </Text>
            </View>
            <Text style={[styles.servicePrice, { color: c.primary }]}>
              {service.price.toLocaleString()} {STRINGS.sar}
            </Text>
          </View>
        </Card>

        <Text style={[styles.label, { color: c.foreground }]}>{STRINGS.selectDate}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
        >
          {days.map((d) => {
            const active = date === d.iso;
            return (
              <Pressable
                key={d.iso}
                onPress={() => setDate(d.iso)}
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

        <Text style={[styles.label, { color: c.foreground }]}>{STRINGS.selectTime}</Text>
        <View style={styles.timesGrid}>
          {TIME_SLOTS.map((t) => {
            const active = time === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTime(t)}
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
                        ? "Inter_700Bold"
                        : "Inter_500Medium",
                    },
                  ]}
                >
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: c.foreground }]}>{STRINGS.location}</Text>
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

        <View style={{ marginTop: 12 }}>
          <Input
            placeholder={STRINGS.locationPlaceholder}
            value={address}
            onChangeText={setAddress}
            rightIcon={<Feather name="map-pin" size={16} color={c.mutedForeground} />}
          />
        </View>

        <Text style={[styles.label, { color: c.foreground }]}>{STRINGS.notes}</Text>
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
            placeholder={STRINGS.notesPlaceholder}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            style={{ height: 100, textAlignVertical: "top" }}
          />
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
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: c.mutedForeground }]}>
            الإجمالي
          </Text>
          <Text style={[styles.totalValue, { color: c.foreground }]}>
            {service.price.toLocaleString()} {STRINGS.sar}
          </Text>
        </View>
        <Button
          label={STRINGS.submitBooking}
          onPress={submit}
          loading={submitting}
          size="lg"
        />
      </View>
    </KeyboardAvoidingView>
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
  serviceTitle: { fontFamily: "Inter_700Bold", fontSize: 14, textAlign: "right" },
  serviceDur: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 3,
    textAlign: "right",
  },
  servicePrice: { fontFamily: "Inter_700Bold", fontSize: 14 },
  label: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginTop: 22,
    marginBottom: 10,
    textAlign: "right",
  },
  dateChip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    minWidth: 80,
  },
  dateChipDay: { fontFamily: "Inter_700Bold", fontSize: 13 },
  dateChipSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3 },
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
  cityChipText: { fontFamily: "Inter_500Medium", fontSize: 13 },
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
  totalLabel: { fontFamily: "Inter_500Medium", fontSize: 14 },
  totalValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
});
