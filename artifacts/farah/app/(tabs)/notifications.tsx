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
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { AppNotification } from "@/lib/data";
import { useT } from "@/lib/i18n";

// Map notifications to icon + accent colour based on title/body keywords.
// We rely on title text instead of a `kind` field because the existing
// API doesn't return a discriminator — keeps this purely cosmetic.
function pickNotificationIcon(n: AppNotification): keyof typeof Feather.glyphMap {
  const haystack = `${n.titleAr} ${n.titleEn} ${n.bodyAr} ${n.bodyEn}`.toLowerCase();
  if (n.bookingId) return "calendar";
  if (/تقييم|review|rating/.test(haystack)) return "star";
  if (/دفع|payment|paid|مبلغ/.test(haystack)) return "credit-card";
  if (/اعتماد|approved|verified|تم اعتماد/.test(haystack)) return "check-circle";
  if (/رفض|rejected|reject/.test(haystack)) return "x-circle";
  if (/مزود|provider|طلب تسجيل|signup/.test(haystack)) return "user-plus";
  return "bell";
}

function pickNotificationColor(n: AppNotification): string {
  const haystack = `${n.titleAr} ${n.titleEn} ${n.bodyAr} ${n.bodyEn}`.toLowerCase();
  if (/رفض|rejected|reject|فشل|failed/.test(haystack)) return "#dc2626";
  if (/اعتماد|approved|verified/.test(haystack)) return "#16a34a";
  if (/دفع|payment|paid/.test(haystack)) return "#0ea5e9";
  if (/تقييم|review|rating/.test(haystack)) return "#f59e0b";
  return "#7b2cbf";
}

export default function NotificationsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { notifications, markNotificationsRead } = useApp();
  const { t, isRtl, lang } = useT();
  const hasUnread = notifications.some((n) => !n.read);
  // Notifications target a logged-in user — gate behind auth.
  const ready = useRequireAuth();

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

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: c.background }} />;
  }

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
          {notifications.map((n) => {
            const iconName = pickNotificationIcon(n);
            const iconColor = pickNotificationColor(n);
            const isClickable = !!n.bookingId;
            return (
              <Pressable
                key={n.id}
                onPress={() => {
                  if (n.bookingId) router.push(`/booking/${n.bookingId}`);
                }}
                disabled={!isClickable}
                style={({ pressed }) => [
                  styles.item,
                  {
                    backgroundColor: c.card,
                    borderColor: n.read ? c.border : iconColor + "33",
                    borderRadius: 16,
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed && isClickable ? 0.99 : 1 }],
                    flexDirection: flexDir,
                    shadowColor: n.read ? "#000" : iconColor,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: n.read ? 0.04 : 0.08,
                    shadowRadius: 6,
                    elevation: n.read ? 1 : 2,
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: iconColor + "1A" },
                  ]}
                >
                  <Feather name={iconName} size={20} color={iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={[styles.head, { flexDirection: flexDir }]}>
                    <Text
                      style={[
                        styles.title,
                        {
                          color: c.foreground,
                          textAlign: align,
                          fontFamily: n.read
                            ? "Cairo_600SemiBold"
                            : "Cairo_700Bold",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {lang === "en"
                        ? n.titleEn || n.title
                        : n.titleAr || n.title}
                    </Text>
                    {!n.read ? <View style={[styles.unreadDot, { backgroundColor: iconColor }]} /> : null}
                  </View>
                  <Text
                    style={[
                      styles.body,
                      { color: c.mutedForeground, textAlign: align },
                    ]}
                    numberOfLines={3}
                  >
                    {lang === "en" ? n.bodyEn || n.body : n.bodyAr || n.body}
                  </Text>
                  <View
                    style={[styles.metaRow, { flexDirection: flexDir }]}
                  >
                    <Text style={[styles.time, { color: c.mutedForeground }]}>
                      {formatTime(n.createdAt)}
                    </Text>
                    {isClickable ? (
                      <View style={styles.openHint}>
                        <Text
                          style={[styles.openHintText, { color: iconColor }]}
                        >
                          {t("openBooking")}
                        </Text>
                        <Feather
                          name={isRtl ? "chevron-left" : "chevron-right"}
                          size={12}
                          color={iconColor}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
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
    padding: 14,
    marginBottom: 12,
    gap: 12,
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  head: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 6,
  },
  title: { fontSize: 14, flex: 1 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  time: { fontFamily: "Cairo_500Medium", fontSize: 11 },
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  metaRow: {
    marginTop: 8,
    justifyContent: "space-between",
    alignItems: "center",
  },
  openHint: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 2,
  },
  openHintText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
  },
});
