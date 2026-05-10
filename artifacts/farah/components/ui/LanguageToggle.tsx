import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { setAppLanguage, useT } from "@/lib/i18n";

/**
 * Compact AR/EN language switcher for screens that don't yet have a profile
 * (auth pages: login / signup / profile-setup). Lives outside the design
 * system colors so it can sit on top of the gradient hero.
 *
 * On press: toggles between Arabic and English, persists the choice via
 * setAppLanguage, and (because RTL is a bridge-level setting) silently
 * queues a reload — visible UI update happens immediately for text, full
 * RTL flip happens after the user re-opens the app.
 */
export function LanguageToggle({
  onSurface = "light",
}: {
  onSurface?: "light" | "dark";
}) {
  const { lang } = useT();
  const [busy, setBusy] = useState(false);

  const otherLang = lang === "ar" ? "en" : "ar";
  const otherLabel = otherLang === "en" ? "English" : "العربية";

  // On a dark/colored hero we use translucent white; on a light surface
  // we use a tinted background. Both keep good contrast.
  const palette =
    onSurface === "dark"
      ? {
          bg: "rgba(255,255,255,0.16)",
          border: "rgba(255,255,255,0.28)",
          text: "#ffffff",
          icon: "#ffffff",
        }
      : {
          bg: "rgba(123,44,191,0.10)",
          border: "rgba(123,44,191,0.25)",
          text: "#5a189a",
          icon: "#5a189a",
        };

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setAppLanguage(otherLang);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      hitSlop={8}
    >
      <Feather name="globe" size={14} color={palette.icon} />
      <Text style={[styles.label, { color: palette.text }]}>
        {otherLabel}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  label: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
});
