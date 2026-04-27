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
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

const CODE_LENGTH = 6;

export default function OtpScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifySignupOtp, resendSignupOtp } = useAuth();
  const { t, isRtl } = useT();

  const targetEmail = String(email ?? "").trim().toLowerCase();
  const [code, setCode] = useState<string[]>(() =>
    Array.from({ length: CODE_LENGTH }, () => ""),
  );
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(45);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const inputs = useRef<Array<TextInput | null>>([]);
  const indexes = useMemo(
    () => Array.from({ length: CODE_LENGTH }, (_, i) => i),
    [],
  );

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const onChange = (i: number, val: string) => {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = ch;
    setCode(next);
    setError("");
    if (ch && i < CODE_LENGTH - 1) inputs.current[i + 1]?.focus();
  };

  const verify = async () => {
    const joined = code.join("");
    if (joined.length !== CODE_LENGTH) {
      setError(t("otpEnterFull"));
      return;
    }
    if (!targetEmail) {
      setError(t("otpEmailMissing"));
      return;
    }
    setVerifying(true);
    try {
      await verifySignupOtp(targetEmail, joined);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setError(msg || t("otpInvalid"));
    } finally {
      setVerifying(false);
    }
  };

  const onResend = async () => {
    if (!targetEmail) {
      setError(t("otpEmailMissing"));
      return;
    }
    setError("");
    setResending(true);
    try {
      await resendSignupOtp(targetEmail);
      setSeconds(45);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setError(msg || t("otpSendFailed"));
    } finally {
      setResending(false);
    }
  };

  const align = isRtl ? ("right" as const) : ("left" as const);

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
        <Pressable
          onPress={() => {
            // Fall back to login when the navigation stack is empty (e.g.
            // when the OTP route was reached via replace or a deep link).
            if (router.canGoBack()) router.back();
            else router.replace("/(auth)/login");
          }}
          style={styles.backBtn}
        >
          <Text style={[styles.backText, { color: c.primary }]}>
            {isRtl ? "← " : "← "}
            {t("back")}
          </Text>
        </Pressable>

        <Text style={[styles.title, { color: c.foreground, textAlign: align }]}>
          {t("otpTitle")}
        </Text>
        <Text style={[styles.desc, { color: c.mutedForeground, textAlign: align }]}>
          {t("otpEmailDesc")} ({targetEmail})
        </Text>

        <View
          style={[
            styles.boxes,
            { flexDirection: isRtl ? "row-reverse" : "row" },
          ]}
        >
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
                styles.box,
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
            {t("otpHintInbox")}
          </Text>
        )}

        <View style={{ marginTop: 28 }}>
          <Button
            label={t("verify")}
            onPress={verify}
            loading={verifying}
            size="lg"
          />
        </View>

        <View style={styles.resendRow}>
          {seconds > 0 ? (
            <Text style={[styles.timer, { color: c.mutedForeground }]}>
              {t("otpResendIn", { seconds })}
            </Text>
          ) : (
            <Pressable onPress={onResend} disabled={resending}>
              <Text
                style={[
                  styles.timer,
                  { color: c.primary, fontFamily: "Cairo_600SemiBold" },
                ]}
              >
                {resending ? t("sendingCode") : t("resend")}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24 },
  backBtn: { alignSelf: "flex-start", paddingVertical: 8 },
  backText: { fontFamily: "Cairo_600SemiBold", fontSize: 14 },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 26,
    marginTop: 24,
  },
  desc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    marginTop: 8,
  },
  boxes: {
    justifyContent: "center",
    gap: 8,
    marginTop: 36,
  },
  box: {
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
