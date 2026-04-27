import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";
import { subscribeToOnlineStatus } from "@/lib/network";

/**
 * Top-of-screen banner that appears when the device is offline.
 * Driven by `subscribeToOnlineStatus()` which uses navigator.onLine on web
 * and a periodic Supabase ping on native.
 */
export function OfflineBanner() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    return subscribeToOnlineStatus(setOnline);
  }, []);

  if (online) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          paddingTop: (Platform.OS === "web" ? 8 : insets.top) + 4,
          backgroundColor: c.destructive,
        },
      ]}
    >
      <View style={styles.row}>
        <Feather name="wifi-off" size={14} color="#ffffff" />
        <Text style={styles.text}>{t("offlineBanner")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 6,
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  text: {
    color: "#ffffff",
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
});
