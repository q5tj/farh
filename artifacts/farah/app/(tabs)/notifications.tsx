import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { STRINGS } from "@/constants/strings";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

export default function NotificationsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { notifications, markNotificationsRead } = useApp();

  useEffect(() => {
    const t = setTimeout(() => {
      markNotificationsRead();
    }, 600);
    return () => clearTimeout(t);
  }, [markNotificationsRead]);

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "الآن";
    if (m < 60) return `قبل ${m} دقيقة`;
    const h = Math.floor(m / 60);
    if (h < 24) return `قبل ${h} ساعة`;
    const d = Math.floor(h / 24);
    return `قبل ${d} يوم`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={STRINGS.notifications} showBack={false} />

      {notifications.length === 0 ? (
        <EmptyState
          icon="bell"
          title={STRINGS.noNotifications}
          description={STRINGS.noNotificationsDesc}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: isWeb ? 110 : insets.bottom + 90,
          }}
        >
          {notifications.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => {
                if (n.bookingId) router.push(`/booking/${n.bookingId}`);
              }}
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: c.card,
                  borderColor: c.border,
                  borderRadius: c.radius,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: n.read ? c.muted : c.primaryBg },
                ]}
              >
                <Feather
                  name="bell"
                  size={18}
                  color={n.read ? c.mutedForeground : c.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.head}>
                  <Text
                    style={[styles.title, { color: c.foreground }]}
                    numberOfLines={1}
                  >
                    {n.title}
                  </Text>
                  <Text style={[styles.time, { color: c.mutedForeground }]}>
                    {formatTime(n.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.body, { color: c.mutedForeground }]}>
                  {n.body}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row-reverse",
    gap: 12,
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  head: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 14, flex: 1, textAlign: "right" },
  time: { fontFamily: "Inter_400Regular", fontSize: 11, marginRight: 8 },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 19,
  },
});
