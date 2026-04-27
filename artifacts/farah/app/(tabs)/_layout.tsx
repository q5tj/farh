import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

function NotificationDot({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={styles.dot}>
      <Text style={styles.dotText}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

export default function TabLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { notifications } = useApp();
  const { t } = useT();
  const unread = notifications.filter((n) => !n.read).length;
  const isWeb = Platform.OS === "web";

  // On Android the system gesture/nav bar lives at the very bottom of the
  // screen; the tab bar must reserve `insets.bottom` so its icons aren't
  // covered. iOS's home-indicator inset is handled the same way.
  const bottomInset = isWeb ? 8 : insets.bottom;
  const labelPad = 4;
  const tabBarHeight = (isWeb ? 60 : 56) + bottomInset;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.background,
          borderTopColor: c.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: bottomInset + labelPad,
          ...(isWeb
            ? ({
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
              } as object)
            : {}),
        },
        tabBarLabelStyle: {
          fontFamily: "Cairo_500Medium",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("home"),
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t("bookings"),
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t("notifications"),
          tabBarIcon: ({ color, size }) => (
            <View>
              <Feather name="bell" size={size} color={color} />
              <NotificationDot count={unread} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("profile"),
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  dotText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Cairo_700Bold",
  },
});
