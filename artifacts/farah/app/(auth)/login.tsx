import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { isEmail, useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { infoDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function LoginScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { login, resetPassword } = useAuth();
  const { t, isRtl } = useT();
  // Honour the ?next=… query string set by useRequireAuth when a guest
  // hit an account-only screen. Falls back to the home tab.
  const { next } = useLocalSearchParams<{ next?: string }>();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const onForgotPassword = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!isEmail(trimmed)) {
      await infoDialog({
        title: t("resetPasswordTitle"),
        message: t("invalidEmail"),
      });
      return;
    }
    setResetting(true);
    try {
      await resetPassword(trimmed);
      await infoDialog({
        title: t("resetPasswordTitle"),
        message: t("resetPasswordSent"),
      });
    } catch {
      await infoDialog({
        title: t("resetPasswordTitle"),
        message: t("resetPasswordFailed"),
      });
    } finally {
      setResetting(false);
    }
  };

  const onSubmit = async () => {
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!isEmail(trimmed)) {
      setError(t("invalidEmail"));
      return;
    }
    if (password.length < 8) {
      setError(t("invalidPassword"));
      return;
    }
    if (!isSupabaseConfigured) {
      setError(t("supabaseNotConfigured"));
      return;
    }
    setSubmitting(true);
    try {
      await login(trimmed, password);
      // Send the user back to wherever they were trying to go. The
      // AuthGate also has a default redirect to /(tabs), so this just
      // hijacks it for the `?next=` case.
      if (typeof next === "string" && next.startsWith("/")) {
        router.replace(next as never);
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (msg.toLowerCase().includes("email not confirmed")) {
        // Email-confirm is still ON in Supabase Dashboard. Surface a clear
        // hint instead of redirecting to an OTP screen.
        setError(t("emailNotConfirmed"));
      } else {
        setError(t("loginFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingBottom: isWeb ? 50 : insets.bottom + 30,
      }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
        <LinearGradient
          colors={["#9333ea", "#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.hero,
            { paddingTop: (isWeb ? 30 : insets.top) + 30 },
          ]}
        >
          {/* Decorative circles for modern glassmorphism look */}
          <View style={styles.decorCircleA} />
          <View style={styles.decorCircleB} />
          <View style={styles.decorCircleC} />

          <View style={styles.languageToggleAnchor}>
            <LanguageToggle onSurface="dark" />
          </View>
          <View style={styles.logoCircle}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.logo}
            />
          </View>
          <Text style={styles.appName}>{t("appName")}</Text>
          <Text style={styles.tagline}>{t("tagline")}</Text>
        </LinearGradient>

        <View style={styles.formWrap}>
          <Text style={[styles.title, { color: c.foreground, textAlign: isRtl ? "right" : "left" }]}>
            {t("loginTitle")}
          </Text>
          <Text style={[styles.subtitle, { color: c.mutedForeground, textAlign: isRtl ? "right" : "left" }]}>
            {t("welcome")}
          </Text>

          <View style={{ marginTop: 24 }}>
            <Input
              label={t("emailLabel")}
              placeholder={t("emailPlaceholder")}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={120}
              rightIcon={
                <Feather name="mail" size={18} color={c.mutedForeground} />
              }
            />
          </View>

          <View style={{ marginTop: 14 }}>
            <Input
              label={t("passwordLabel")}
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError("");
              }}
              secureTextEntry={!showPwd}
              autoCapitalize="none"
              maxLength={64}
              error={error}
              rightIcon={
                <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={8}>
                  <Feather
                    name={showPwd ? "eye-off" : "eye"}
                    size={18}
                    color={c.mutedForeground}
                  />
                </Pressable>
              }
            />
          </View>

          <Pressable
            onPress={onForgotPassword}
            disabled={resetting}
            style={({ pressed }) => [
              styles.forgotPwdBtn,
              { opacity: pressed || resetting ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.forgotPwdText, { color: c.primary }]}>
              {resetting ? t("loggingIn") : t("forgotPassword")}
            </Text>
          </Pressable>

          <View style={{ marginTop: 16 }}>
            <Button
              label={submitting ? t("loggingIn") : t("loginAction")}
              onPress={onSubmit}
              loading={submitting}
              size="lg"
            />
          </View>

          <Pressable
            onPress={() => router.replace("/(tabs)")}
            style={({ pressed }) => [
              styles.guestBtn,
              {
                borderColor: c.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="eye" size={16} color={c.foreground} />
            <Text style={[styles.guestBtnText, { color: c.foreground }]}>
              {t("browseAsGuest")}
            </Text>
          </Pressable>

          <Text style={[styles.legalNote, { color: c.mutedForeground }]}>
            {t("termsLoginNote")}
          </Text>
          <View style={styles.legalLinksRow}>
            <Link
              href={{ pathname: "/legal/[key]", params: { key: "terms_conditions" } }}
              asChild
            >
              <Pressable>
                <Text style={[styles.legalLink, { color: c.primary }]}>
                  {t("termsViewTerms")}
                </Text>
              </Pressable>
            </Link>
            <Text style={{ color: c.mutedForeground }}> • </Text>
            <Link
              href={{ pathname: "/legal/[key]", params: { key: "privacy_policy" } }}
              asChild
            >
              <Pressable>
                <Text style={[styles.legalLink, { color: c.primary }]}>
                  {t("termsViewPrivacy")}
                </Text>
              </Pressable>
            </Link>
          </View>

          <View
            style={[
              styles.footerRow,
              { flexDirection: isRtl ? "row-reverse" : "row" },
            ]}
          >
            <Text style={[styles.footerText, { color: c.mutedForeground }]}>
              {t("noAccount")}{" "}
            </Text>
            <Link href="/(auth)/signup" asChild>
              <Pressable>
                <Text style={[styles.footerLink, { color: c.primary }]}>
                  {t("goToSignup")}
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 60,
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  decorCircleA: {
    position: "absolute",
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  decorCircleB: {
    position: "absolute",
    bottom: -40,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(236,72,153,0.18)",
  },
  decorCircleC: {
    position: "absolute",
    top: "40%",
    left: -30,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  languageToggleAnchor: {
    position: "absolute",
    top: 14,
    right: 16,
  },
  logoCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
  },
  logo: { width: 78, height: 78, borderRadius: 39 },
  appName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 32,
    color: "#ffffff",
    letterSpacing: 1,
  },
  tagline: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    marginTop: 6,
    textAlign: "center",
  },
  formWrap: {
    paddingHorizontal: 24,
    paddingTop: 30,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    textAlign: "right",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    marginTop: 6,
    textAlign: "right",
  },
  footerRow: {
    marginTop: 28,
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
  },
  footerLink: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
  },
  legalNote: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginTop: 14,
    lineHeight: 19,
  },
  legalLinksRow: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },
  legalLink: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  guestBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  guestBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 15,
  },
  forgotPwdBtn: {
    marginTop: 14,
    alignSelf: "flex-end",
    paddingVertical: 4,
  },
  forgotPwdText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
  },
});
