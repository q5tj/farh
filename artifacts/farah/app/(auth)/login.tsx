import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
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
import { useT } from "@/lib/i18n";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function LoginScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { login } = useAuth();
  const { t, isRtl } = useT();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        paddingTop: isWeb ? 70 : insets.top + 20,
        paddingBottom: isWeb ? 50 : insets.bottom + 30,
      }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
        <LinearGradient
          colors={["#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
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

          <View style={{ marginTop: 24 }}>
            <Button
              label={submitting ? t("loggingIn") : t("loginAction")}
              onPress={onSubmit}
              loading={submitting}
              size="lg"
            />
          </View>

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
    paddingTop: 30,
    paddingBottom: 50,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
    position: "relative",
  },
  languageToggleAnchor: {
    position: "absolute",
    top: 14,
    right: 16,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logo: { width: 72, height: 72, borderRadius: 36 },
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
});
