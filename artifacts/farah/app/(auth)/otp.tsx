import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { STRINGS } from "@/constants/strings";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

export default function OtpScreen() {
  const c = useColors();
  const { identifier, type } = useLocalSearchParams<{
    identifier: string;
    type: "email" | "phone";
  }>();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const isWeb = Platform.OS === "web";
  const isEmailFlow = type === "email";
  const codeLength = isEmailFlow ? 6 : 4;

  const [code, setCode] = useState<string[]>(() =>
    Array.from({ length: codeLength }, () => ""),
  );
  const [error, setError] = useState("");
  const inputs = useRef<Array<TextInput | null>>([]);
  const [seconds, setSeconds] = useState(45);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const indexes = useMemo(
    () => Array.from({ length: codeLength }, (_, i) => i),
    [codeLength],
  );

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const onChange = (i: number, val: string) => {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = ch;
    setCode(next);
    setError("");
    if (ch && i < codeLength - 1) inputs.current[i + 1]?.focus();
  };

  const verify = async () => {
    const joined = code.join("");
    if (joined.length !== codeLength) {
      setError("الرجاء إدخال الرمز كاملاً");
      return;
    }

    if (isEmailFlow) {
      setLoading(true);
      const { error: err } = await supabase.auth.verifyOtp({
        email: String(identifier ?? ""),
        token: joined,
        type: "email",
      });
      if (err) {
        setLoading(false);
        setError(err.message || STRINGS.otpInvalid);
        return;
      }
      await signIn(String(identifier ?? ""));
      setLoading(false);
      return;
    }

    // phone demo flow
    if (joined !== "1234") {
      setError("رمز غير صحيح. للتجربة استخدم 1234");
      return;
    }
    setLoading(true);
    await signIn(String(identifier ?? ""));
    setLoading(false);
  };

  const onResend = async () => {
    setError("");
    if (isEmailFlow) {
      setResending(true);
      const { error: err } = await supabase.auth.signInWithOtp({
        email: String(identifier ?? ""),
        options: { shouldCreateUser: true },
      });
      setResending(false);
      if (err) {
        setError(err.message || STRINGS.otpSendFailed);
        return;
      }
    }
    setSeconds(45);
  };

  const targetLabel = isEmailFlow ? "البريد" : "الجوال";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <View
        style={[
          styles.wrap,
          {
            paddingTop: isWeb ? 80 : insets.top + 30,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.primary }]}>
            ← {STRINGS.back}
          </Text>
        </Pressable>

        <Text style={[styles.title, { color: c.foreground }]}>
          {STRINGS.otpTitle}
        </Text>
        <Text style={[styles.desc, { color: c.mutedForeground }]}>
          {isEmailFlow ? STRINGS.otpEmailDesc : STRINGS.otpDesc} {targetLabel}: {identifier}
        </Text>

        <View style={styles.boxes}>
          {indexes.map((i) => (
            <TextInput
              key={i}
              ref={(r) => {
                inputs.current[i] = r;
              }}
              value={code[i]}
              onChangeText={(v) => onChange(i, v)}
              keyboardType="number-pad"
              maxLength={1}
              style={[
                isEmailFlow ? styles.box6 : styles.box,
                {
                  borderColor: error
                    ? c.destructive
                    : code[i]
                      ? c.primary
                      : c.border,
                  color: c.foreground,
                  backgroundColor: c.background,
                  borderRadius: c.radius - 4,
                },
              ]}
            />
          ))}
        </View>

        {error ? (
          <Text style={[styles.error, { color: c.destructive }]}>{error}</Text>
        ) : (
          <Text style={[styles.hint, { color: c.mutedForeground }]}>
            {isEmailFlow ? "ابحث في بريدك (وصندوق الإعلانات) عن رسالة من Supabase" : STRINGS.otpHint}
          </Text>
        )}

        <View style={{ marginTop: 28 }}>
          <Button
            label={STRINGS.verify}
            onPress={verify}
            loading={loading}
            size="lg"
          />
        </View>

        <View style={styles.resendRow}>
          {seconds > 0 ? (
            <Text style={[styles.timer, { color: c.mutedForeground }]}>
              إعادة الإرسال خلال {seconds} ثانية
            </Text>
          ) : (
            <Pressable onPress={onResend} disabled={resending}>
              <Text style={[styles.timer, { color: c.primary, fontFamily: "Cairo_600SemiBold" }]}>
                {resending ? "جاري الإرسال..." : STRINGS.resend}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 24,
  },
  backBtn: { alignSelf: "flex-start", paddingVertical: 8 },
  backText: { fontFamily: "Cairo_600SemiBold", fontSize: 14 },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 26,
    marginTop: 24,
    textAlign: "right",
  },
  desc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    marginTop: 8,
    textAlign: "right",
  },
  boxes: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    gap: 10,
    marginTop: 36,
  },
  box: {
    width: 64,
    height: 70,
    borderWidth: 2,
    textAlign: "center",
    fontSize: 28,
    fontFamily: "Cairo_700Bold",
  },
  box6: {
    width: 46,
    height: 60,
    borderWidth: 2,
    textAlign: "center",
    fontSize: 22,
    fontFamily: "Cairo_700Bold",
  },
  error: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    marginTop: 16,
    textAlign: "center",
  },
  hint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 16,
    textAlign: "center",
  },
  resendRow: { alignItems: "center", marginTop: 20 },
  timer: { fontFamily: "Cairo_500Medium", fontSize: 13 },
});
