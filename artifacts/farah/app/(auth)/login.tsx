import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { STRINGS } from "@/constants/strings";
import { isEmail, isPhone } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");

  const onSend = () => {
    const value = identifier.trim();
    if (isEmail(value)) {
      router.push({
        pathname: "/(auth)/otp",
        params: { identifier: value.toLowerCase(), type: "email" },
      });
      return;
    }
    if (isPhone(value)) {
      const cleaned = value.replace(/\D/g, "");
      router.push({
        pathname: "/(auth)/otp",
        params: { identifier: cleaned, type: "phone" },
      });
      return;
    }
    setError("الرجاء إدخال بريد إلكتروني أو رقم جوال صحيح");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: isWeb ? 70 : insets.top + 20,
          paddingBottom: isWeb ? 50 : insets.bottom + 30,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={["#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.logoCircle}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.logo}
            />
          </View>
          <Text style={styles.appName}>{STRINGS.appName}</Text>
          <Text style={styles.tagline}>{STRINGS.tagline}</Text>
        </LinearGradient>

        <View style={styles.formWrap}>
          <Text style={[styles.title, { color: c.foreground }]}>
            {STRINGS.welcome}
          </Text>
          <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
            أدخل بريدك الإلكتروني أو رقم جوالك لإرسال رمز التحقق
          </Text>

          <View style={{ marginTop: 24 }}>
            <Input
              label="البريد الإلكتروني أو رقم الجوال"
              placeholder="example@email.com  أو  05xxxxxxxx"
              value={identifier}
              onChangeText={(t) => {
                setIdentifier(t);
                setError("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={64}
              error={error}
              rightIcon={
                <Feather
                  name={isEmail(identifier) ? "mail" : "phone"}
                  size={18}
                  color={c.mutedForeground}
                />
              }
            />
          </View>

          <View style={{ marginTop: 24 }}>
            <Button label={STRINGS.sendOtp} onPress={onSend} size="lg" />
          </View>

          <View
            style={[styles.hintBox, { backgroundColor: c.primaryBg, borderRadius: c.radius }]}
          >
            <Feather name="info" size={16} color={c.primary} />
            <Text style={[styles.hintText, { color: c.primary }]}>
              للتجربة: استخدم البريد المعتمد، أو رقم جوال (ينتهي بـ 0 = مالك، بـ 1/2 = مزود)
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  hintBox: {
    marginTop: 28,
    padding: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  hintText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    flex: 1,
    textAlign: "right",
    lineHeight: 18,
  },
});
