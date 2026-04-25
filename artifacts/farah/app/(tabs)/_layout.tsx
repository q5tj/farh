import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

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
  const { notifications } = useApp();
  const unread = notifications.filter((n) => !n.read).length;
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.background,
          borderTopColor: c.border,
          height: isWeb ? 84 : undefined,
          paddingTop: 6,
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
          title: "الرئيسية",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "حجوزاتي",
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "الإشعارات",
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
          title: "حسابي",
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
