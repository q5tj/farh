import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Stars } from "@/components/ui/Stars";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

export default function RateScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rateBooking, bookings, providerBookings, getProvider } = useApp();
  const booking =
    bookings.find((b) => b.id === String(id)) ??
    providerBookings.find((b) => b.id === String(id));
  const provider = booking ? getProvider(booking.providerId) : null;
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!booking) return;
    await rateBooking(booking.id, rating, text);
    setDone(true);
    setTimeout(() => router.back(), 1000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("rateService")} />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 24,
          paddingBottom: insets.bottom + 24,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Text style={[styles.title, { color: c.foreground }]}>
          {t("ratePrompt")}
        </Text>
        {provider ? (
          <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
            {provider.name}
          </Text>
        ) : null}

        <View style={{ alignItems: "center", marginTop: 30, marginBottom: 20 }}>
          <Stars value={rating} size={42} onChange={setRating} />
        </View>

        <Text style={[styles.label, { color: c.foreground }]}>
          {t("comment")}
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t("commentPlaceholder")}
          placeholderTextColor={c.mutedForeground}
          multiline
          numberOfLines={4}
          style={[
            styles.input,
            {
              borderColor: c.border,
              color: c.foreground,
              borderRadius: c.radius - 4,
              backgroundColor: c.background,
              textAlignVertical: "top",
              writingDirection: "rtl",
            },
          ]}
        />

        <View style={{ marginTop: "auto" }}>
          <Button
            label={done ? t("thanksReview") : t("submitReview")}
            onPress={submit}
            disabled={done}
            size="lg"
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    textAlign: "right",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    marginTop: 4,
    textAlign: "right",
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    marginTop: 16,
    marginBottom: 10,
    textAlign: "right",
  },
  input: {
    borderWidth: 1,
    minHeight: 110,
    padding: 14,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "right",
  },
});
