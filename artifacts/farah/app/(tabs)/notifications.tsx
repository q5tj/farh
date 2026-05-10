import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
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
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

export default function NotificationsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { notifications, markNotificationsRead } = useApp();
  const { t, isRtl, lang } = useT();
  const hasUnread = notifications.some((n) => !n.read);

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (lang === "en") {
      if (m < 1) return "now";
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      return `${d}d ago`;
    }
    if (m < 1) return "الآن";
    if (m < 60) return `قبل ${m} دقيقة`;
    const h = Math.floor(m / 60);
    if (h < 24) return `قبل ${h} ساعة`;
    const d = Math.floor(h / 24);
    return `قبل ${d} يوم`;
  };

  const align = isRtl ? ("right" as const) : ("left" as const);
  const flexDir = isRtl ? ("row-reverse" as const) : ("row" as const);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("notifications")}
        showBack={true}
        right={
          // Replace default back chevron with a back button always visible
          null
        }
      />

      {/* The header shows back only if router.canGoBack(). On the notifications
          tab the back stack may be empty, so render an extra inline back button. */}
      {!router.canGoBack() ? (
        <View style={[styles.backRow, { flexDirection: flexDir }]}>
          <Pressable
            onPress={onBack}
            style={[styles.backBtn, { backgroundColor: c.muted }]}
          >
            <Feather
              name={isRtl ? "chevron-right" : "chevron-left"}
              size={20}
              color={c.foreground}
            />
            <Text style={[styles.backText, { color: c.foreground }]}>
              {t("back")}
            </Text>
          </Pressable>
          {hasUnread ? (
            <Pressable
              onPress={() => markNotificationsRead()}
              style={[styles.markAllBtn, { backgroundColor: c.primary }]}
            >
              <Feather name="check-circle" size={14} color="#ffffff" />
              <Text style={styles.markAllText}>{t("markAllRead")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : hasUnread ? (
        <View style={[styles.backRow, { flexDirection: flexDir }]}>
          <Pressable
            onPress={() => markNotificationsRead()}
            style={[styles.markAllBtn, { backgroundColor: c.primary }]}
          >
            <Feather name="check-circle" size={14} color="#ffffff" />
            <Text style={styles.markAllText}>{t("markAllRead")}</Text>
          </Pressable>
        </View>
      ) : null}

      {notifications.length === 0 ? (
        <EmptyState
          icon="bell"
          title={t("noNotifications")}
          description={t("noNotificationsDesc")}
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
                  flexDirection: flexDir,
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
                <View style={[styles.head, { flexDirection: flexDir }]}>
                  <Text
                    style={[
                      styles.title,
                      { color: c.foreground, textAlign: align },
                    ]}
                    numberOfLines={1}
                  >
                    {lang === "en" ? n.titleEn || n.title : n.titleAr || n.title}
                  </Text>
                  <Text style={[styles.time, { color: c.mutedForeground }]}>
                    {formatTime(n.createdAt)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.body,
                    { color: c.mutedForeground, textAlign: align },
                  ]}
                >
                  {lang === "en" ? n.bodyEn || n.body : n.bodyAr || n.body}
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
  backRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 100,
    gap: 6,
  },
  backText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 100,
    gap: 6,
  },
  markAllText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: "#ffffff",
  },
  item: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
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
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14, flex: 1 },
  time: { fontFamily: "Cairo_400Regular", fontSize: 11, marginHorizontal: 8 },
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
});
