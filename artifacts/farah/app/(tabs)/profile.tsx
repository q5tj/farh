import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LangCode, useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { setAppLanguage, useT } from "@/lib/i18n";
import {
  deactivatePushAsync,
  getPushPermissionStatus,
  isPushSupported,
  registerPushAsync,
  requestPushPermission,
  type PushPermissionStatus,
} from "@/lib/push";

interface RowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  badge?: string;
  showDot?: boolean;
  chevron?: keyof typeof Feather.glyphMap;
}

function PushRow({
  status,
  busy,
  onToggle,
}: {
  status: PushPermissionStatus;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  const c = useColors();
  const { t } = useT();
  const enabled = status === "granted";
  const subtitle =
    status === "granted"
      ? t("pushToggleEnabledDesc")
      : status === "denied"
        ? t("pushToggleDeniedDesc")
        : t("pushToggleTapToEnable");
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: c.primaryBg }]}>
        <Feather name="bell" size={18} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: c.foreground }]}>
          {t("notifications")}
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Cairo_400Regular",
            fontSize: 11,
            marginTop: 2,
          }}
        >
          {subtitle}
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        disabled={busy}
        thumbColor={enabled ? c.primary : "#f4f4f5"}
        trackColor={{ false: "#d4d4d8", true: c.primary + "55" }}
      />
    </View>
  );
}

function Row({ icon, label, onPress, destructive, badge, showDot, chevron }: RowProps) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: destructive ? "#fee2e2" : c.primaryBg },
        ]}
      >
        <Feather
          name={icon}
          size={18}
          color={destructive ? c.destructive : c.primary}
        />
        {showDot ? <View style={styles.redDot} /> : null}
      </View>
      <Text
        style={[
          styles.rowLabel,
          { color: destructive ? c.destructive : c.foreground },
        ]}
      >
        {label}
      </Text>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: c.primary }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Feather
        name={chevron ?? "chevron-left"}
        size={18}
        color={c.mutedForeground}
      />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { profile, signOut, updateProfile } = useAuth();
  const { t, isRtl } = useT();

  const [langModalOpen, setLangModalOpen] = useState(false);
  const [langSaving, setLangSaving] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushPermissionStatus>("undetermined");
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getPushPermissionStatus().then((s) => {
      if (alive) setPushStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onTogglePush = async (next: boolean) => {
    if (!profile?.id) return;
    setPushBusy(true);
    try {
      if (next) {
        const status = await requestPushPermission();
        setPushStatus(status);
        if (status === "granted") {
          const result = await registerPushAsync(profile.id);
          if (!result.ok && Platform.OS !== "web") {
            Alert.alert(t("pushEnableFailedTitle"), result.reason);
          }
        } else if (status === "denied" && Platform.OS !== "web") {
          Alert.alert(
            t("pushDeniedSystemTitle"),
            t("pushDeniedSystemBody"),
          );
        }
      } else {
        await deactivatePushAsync(profile.id);
        setPushStatus("undetermined");
      }
    } finally {
      setPushBusy(false);
    }
  };

  const confirmLogout = () => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(t("logoutConfirmMsg"))) {
        signOut();
      }
      return;
    }
    Alert.alert(t("logoutConfirmTitle"), t("logoutConfirmMsg"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("confirm"), style: "destructive", onPress: signOut },
    ]);
  };

  const onPickLanguage = async (lang: LangCode) => {
    if (langSaving) return;
    setLangSaving(true);
    try {
      // Apply locally first for instant feedback
      const { needsReload } = await setAppLanguage(lang);
      // Persist to DB
      await updateProfile({ language: lang });
      setLangModalOpen(false);
      if (needsReload && Platform.OS !== "web") {
        Alert.alert(t("languageChanged"), t("restartRequired"));
      }
    } catch {
      // Revert UI? AuthGate will refetch profile and re-sync.
    } finally {
      setLangSaving(false);
    }
  };

  const roleLabel =
    profile?.role === "admin"
      ? t("adminAccount")
      : profile?.role === "provider"
        ? t("providerAccount")
        : t("customerAccount");

  const displayName = profile?.fullName?.trim() || profile?.email || "";
  const profileIncomplete = !profile?.profileCompleted;
  // Use the live i18n language for the badge and the picker indicators
  // so toggling stays in sync immediately, even before AuthContext
  // refetches the profile from the DB.
  const activeLang = useT().lang;
  const langBadge = activeLang === "en" ? t("english") : t("arabic");
  const chevron: keyof typeof Feather.glyphMap = isRtl
    ? "chevron-left"
    : "chevron-right";

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: isWeb ? 110 : insets.bottom + 90,
        }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.hero,
            {
              paddingTop:
                (isWeb ? Math.max(insets.top, 30) : insets.top) + 20,
            },
          ]}
        >
          <View style={styles.avatar}>
            {profile?.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl }}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <Text style={styles.avatarText}>
                {displayName.charAt(0) || t("defaultUserInitial")}
              </Text>
            )}
          </View>
          <Text style={styles.userName}>{displayName}</Text>
          <View style={styles.userMeta}>
            <Feather name="mail" size={12} color="rgba(255,255,255,0.85)" />
            <Text style={styles.userPhone}>{profile?.email ?? ""}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{roleLabel}</Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {(profile?.role === "provider" || profile?.role === "admin") && (
            <Card style={{ marginBottom: 14 }} padded={false}>
              <Row
                icon={profile.role === "admin" ? "shield" : "briefcase"}
                label={
                  profile.role === "admin"
                    ? t("switchToAdmin")
                    : t("switchToProvider")
                }
                chevron={chevron}
                onPress={() => {
                  if (profile.role === "admin") router.push("/admin");
                  else router.push("/provider-zone");
                }}
              />
            </Card>
          )}

          {profile?.role === "customer" && profile?.profileCompleted && (
            <Card style={{ marginBottom: 14 }} padded={false}>
              <Row
                icon="briefcase"
                label={t("becomeProviderCta")}
                chevron={chevron}
                onPress={() => router.push("/provider-zone/onboarding")}
              />
            </Card>
          )}

          <Card style={{ marginBottom: 14 }} padded={false}>
            <Row
              icon="heart"
              label={t("favorites")}
              chevron={chevron}
              onPress={() => router.push("/favorites")}
            />
          </Card>

          <Card padded={false}>
            <Row
              icon="user"
              label={t("myAccount")}
              showDot={profileIncomplete}
              chevron={chevron}
              onPress={() => router.push("/(auth)/profile-setup")}
            />
            <View style={[styles.sep, { backgroundColor: c.border }]} />
            <Row
              icon="globe"
              label={t("language")}
              badge={langBadge}
              chevron={chevron}
              onPress={() => setLangModalOpen(true)}
            />
            {isPushSupported ? (
              <>
                <View style={[styles.sep, { backgroundColor: c.border }]} />
                <PushRow
                  status={pushStatus}
                  busy={pushBusy}
                  onToggle={onTogglePush}
                />
              </>
            ) : null}
            <View style={[styles.sep, { backgroundColor: c.border }]} />
            <Row
              icon="help-circle"
              label={t("support")}
              chevron={chevron}
              onPress={() => router.push("/support")}
            />
            <View style={[styles.sep, { backgroundColor: c.border }]} />
            <Row
              icon="info"
              label={t("aboutApp")}
              chevron={chevron}
              onPress={() => router.push("/about")}
            />
          </Card>

          <Card style={{ marginTop: 14 }} padded={false}>
            <Row
              icon="log-out"
              label={t("logout")}
              destructive
              chevron={chevron}
              onPress={confirmLogout}
            />
          </Card>

          <Text style={[styles.version, { color: c.mutedForeground }]}>
            {t("appName")} • 1.0.0
          </Text>
        </View>
      </ScrollView>

      {/* Language picker modal */}
      <Modal
        visible={langModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setLangModalOpen(false)}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: c.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: c.foreground }]}>
              {t("pickLanguage")}
            </Text>
            <Pressable
              onPress={() => onPickLanguage("ar")}
              style={[
                styles.langOption,
                {
                  borderColor: activeLang === "ar" ? c.primary : c.border,
                  backgroundColor:
                    activeLang === "ar" ? c.primaryBg : "transparent",
                },
              ]}
            >
              <Text style={[styles.langOptionText, { color: c.foreground }]}>
                العربية
              </Text>
              {activeLang === "ar" ? (
                <Feather name="check" size={18} color={c.primary} />
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => onPickLanguage("en")}
              style={[
                styles.langOption,
                {
                  borderColor: activeLang === "en" ? c.primary : c.border,
                  backgroundColor:
                    activeLang === "en" ? c.primaryBg : "transparent",
                },
              ]}
            >
              <Text style={[styles.langOptionText, { color: c.foreground }]}>
                English
              </Text>
              {activeLang === "en" ? (
                <Feather name="check" size={18} color={c.primary} />
              ) : null}
            </Pressable>
            {langSaving ? (
              <Text style={[styles.savingHint, { color: c.mutedForeground }]}>
                {t("loading")}
              </Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    alignItems: "center",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    overflow: "hidden",
  },
  avatarText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 36,
    color: "#ffffff",
  },
  userName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    color: "#ffffff",
  },
  userMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  userPhone: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
  },
  rolePill: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 100,
  },
  rolePillText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: "#ffffff",
  },
  body: {
    padding: 16,
    marginTop: -12,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  redDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#dc2626",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  rowLabel: {
    flex: 1,
    fontFamily: "Cairo_500Medium",
    fontSize: 15,
  },
  sep: { height: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  badgeText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: "#ffffff",
  },
  version: {
    textAlign: "center",
    marginTop: 24,
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    padding: 22,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    marginBottom: 14,
    textAlign: "center",
  },
  modalDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  langOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  langOptionText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 15,
  },
  savingHint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
  comingSoonIcon: {
    alignSelf: "center",
    marginBottom: 12,
  },
});
