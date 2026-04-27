import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

/**
 * Pending / Rejected gate for provider-zone.
 *
 * Mounted by `provider-zone/index.tsx` whenever the provider's
 * `verification_status` is not 'approved'. Realtime subscription on
 * notifications (AppContext) refreshes the profile when admin flips status,
 * so this screen unmounts automatically.
 */
export default function ProviderPending() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile, refreshProfile } = useAuth();

  const status = profile?.providerVerificationStatus ?? "pending";
  const reason = profile?.providerRejectionReason ?? null;
  const isRejected = status === "rejected";

  // Auto-flip to the dashboard the moment the admin approves. The profile is
  // refreshed by AppContext when a verification_status notification arrives.
  useEffect(() => {
    if (!profile) return;
    if (profile.role === "admin") {
      router.replace("/provider-zone");
      return;
    }
    if (!profile.providerId) {
      router.replace("/provider-zone/onboarding");
      return;
    }
    if (status === "approved") {
      router.replace("/provider-zone");
    }
  }, [profile, status]);

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (isRejected) return;
    pulse.value = withRepeat(
      withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
  }, [pulse, isRejected]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <LinearGradient
          colors={
            isRejected ? ["#dc2626", "#991b1b"] : ["#7b2cbf", "#5a189a"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.hero,
            { paddingTop: insets.top + 24 },
          ]}
        >
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)/profile");
            }}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Feather name="chevron-right" size={22} color="#ffffff" />
          </Pressable>

          <Animated.View style={[styles.iconCircle, pulseStyle]}>
            <Feather
              name={isRejected ? "x-circle" : "clock"}
              size={44}
              color="#ffffff"
            />
          </Animated.View>
          <Text style={styles.heroTitle}>
            {isRejected
              ? t("verificationRejectedTitle")
              : t("verificationPendingTitle")}
          </Text>
          <Text style={styles.heroDesc}>
            {isRejected
              ? t("verificationRejectedDesc")
              : t("verificationPendingDesc")}
          </Text>
        </LinearGradient>

        <View style={styles.body}>
          {isRejected && reason ? (
            <Card>
              <View style={styles.reasonHead}>
                <Feather name="alert-circle" size={18} color={c.destructive} />
                <Text style={[styles.reasonTitle, { color: c.foreground }]}>
                  {t("rejectReasonLabel")}
                </Text>
              </View>
              <Text style={[styles.reasonBody, { color: c.foreground }]}>
                {reason}
              </Text>
            </Card>
          ) : null}

          <Button
            label={t("refreshStatus")}
            onPress={onRefresh}
            loading={refreshing}
            variant="secondary"
            size="lg"
          />
          <Button
            label={t("contactSupport")}
            onPress={() => router.push("/support")}
            size="lg"
          />
          <Pressable
            onPress={() => router.replace("/(tabs)")}
            style={styles.linkRow}
          >
            <Text style={[styles.linkText, { color: c.primary }]}>
              {t("backToHome")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 50,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
  },
  backBtn: {
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    marginTop: 8,
  },
  heroTitle: {
    fontFamily: "Cairo_700Bold",
    color: "#ffffff",
    fontSize: 22,
    textAlign: "center",
    marginBottom: 10,
  },
  heroDesc: {
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  reasonHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  reasonTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  reasonBody: {
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    textAlign: "right",
    lineHeight: 22,
  },
  linkRow: {
    alignItems: "center",
    paddingVertical: 12,
  },
  linkText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
  },
});
