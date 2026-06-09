import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { infoDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import {
  fetchProviderMoyasarState,
  verifyProviderMoyasarKeys,
  type ProviderMoyasarStatus,
} from "@/lib/payments";

/**
 * Provider connects their own Moyasar account. The customer's full
 * payment lands in this account directly; the platform's commission is
 * settled separately by the provider from the dashboard. Until the
 * keys verify as `active`, the provider can't accept paid bookings.
 */

const MOYASAR_SIGNUP_URL = "https://moyasar.com/business";
const MOYASAR_DASHBOARD_URL = "https://dashboard.moyasar.com";

export default function MoyasarConnectScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const { ownProvider, refresh } = useApp();
  const providerId = profile?.providerId ?? null;

  const [pk, setPk] = useState("");
  const [sk, setSk] = useState("");
  const [status, setStatus] = useState<ProviderMoyasarStatus>("not_connected");
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!providerId) return;
    let alive = true;
    fetchProviderMoyasarState(providerId)
      .then((s) => {
        if (!alive) return;
        setStatus(s.status);
        setConnectedAt(s.connectedAt);
        setLastError(s.lastError);
        if (s.publishableKey) setPk(s.publishableKey);
      })
      .catch((e) => console.warn("[moyasar-connect] fetch state", e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [providerId]);

  const submit = async () => {
    if (!providerId) return;
    const pkTrim = pk.trim();
    const skTrim = sk.trim();
    if (!pkTrim.startsWith("pk_")) {
      await infoDialog({
        title: t("error"),
        message: t("moyasarPkInvalid"),
      });
      return;
    }
    if (!skTrim.startsWith("sk_")) {
      await infoDialog({
        title: t("error"),
        message: t("moyasarSkInvalid"),
      });
      return;
    }
    setSaving(true);
    try {
      const r = await verifyProviderMoyasarKeys({
        providerId,
        publishableKey: pkTrim,
        secretKey: skTrim,
      });
      setStatus(r.status);
      setLastError(r.error);
      if (r.status === "active") {
        setConnectedAt(new Date());
        setSk(""); // never keep sk in memory after success
        await refresh();
        await infoDialog({
          title: t("moyasarVerifiedTitle"),
          message: t("moyasarVerifiedBody"),
        });
      } else {
        await infoDialog({
          title: t("moyasarVerifyFailedTitle"),
          message: r.error ?? t("moyasarVerifyFailedBody"),
        });
      }
    } catch (e) {
      await infoDialog({
        title: t("error"),
        message: (e as Error)?.message ?? t("moyasarVerifyFailedBody"),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title={t("moyasarConnect")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      </View>
    );
  }

  const statusMeta = {
    active: { color: "#16a34a", icon: "check-circle" as const, label: t("moyasarStatusActive") },
    pending: { color: "#f59e0b", icon: "clock" as const, label: t("moyasarStatusPending") },
    failed: { color: "#dc2626", icon: "x-circle" as const, label: t("moyasarStatusFailed") },
    not_connected: { color: "#64748b", icon: "alert-circle" as const, label: t("moyasarStatusNotConnected") },
  }[status];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("moyasarConnect")} />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          gap: 14,
        }}
      >
        <Card>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusIconWrap,
                { backgroundColor: statusMeta.color + "20" },
              ]}
            >
              <Feather name={statusMeta.icon} size={20} color={statusMeta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusLabel, { color: statusMeta.color }]}>
                {statusMeta.label}
              </Text>
              {connectedAt ? (
                <Text style={[styles.statusSub, { color: c.mutedForeground }]}>
                  {t("connectedSince", {
                    date: connectedAt.toLocaleDateString(),
                  })}
                </Text>
              ) : null}
              {lastError && status === "failed" ? (
                <Text style={[styles.statusError, { color: "#dc2626" }]}>
                  {lastError}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        <Card>
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("moyasarConnectIntroTitle")}
          </Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>
            {t("moyasarConnectIntroBody")}
          </Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            <Step n={1} text={t("moyasarStep1")} />
            <Step n={2} text={t("moyasarStep2")} />
            <Step n={3} text={t("moyasarStep3")} />
          </View>
          <View style={{ marginTop: 14, gap: 8 }}>
            <Button
              label={t("openMoyasarSignup")}
              variant="secondary"
              icon={<Feather name="external-link" size={14} color={c.primary} />}
              onPress={() => Linking.openURL(MOYASAR_SIGNUP_URL).catch(() => {})}
            />
            <Button
              label={t("openMoyasarDashboard")}
              variant="ghost"
              icon={<Feather name="external-link" size={14} color={c.primary} />}
              onPress={() =>
                Linking.openURL(MOYASAR_DASHBOARD_URL).catch(() => {})
              }
            />
          </View>
        </Card>

        <Card>
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("moyasarPasteKeysTitle")}
          </Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>
            {t("moyasarPasteKeysBody")}
          </Text>
          <View style={{ marginTop: 12, gap: 10 }}>
            <Input
              label={t("moyasarPkLabel")}
              value={pk}
              onChangeText={setPk}
              placeholder="pk_live_..."
              autoCapitalize="none"
            />
            <Input
              label={t("moyasarSkLabel")}
              value={sk}
              onChangeText={setSk}
              placeholder="sk_live_..."
              autoCapitalize="none"
              secureTextEntry
            />
            <Text style={[styles.warning, { color: c.mutedForeground }]}>
              <Feather name="lock" size={11} /> {t("moyasarSkSecurityNote")}
            </Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <Button
              label={t("verifyAndConnect")}
              onPress={submit}
              loading={saving}
              disabled={!pk.trim() || !sk.trim()}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const c = useColors();
  return (
    <View style={styles.step}>
      <View style={[styles.stepNum, { backgroundColor: c.primaryBg }]}>
        <Text style={[styles.stepNumText, { color: c.primary }]}>{n}</Text>
      </View>
      <Text style={[styles.stepText, { color: c.foreground }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  statusIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  statusLabel: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  statusSub: { fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 4 },
  statusError: { fontFamily: "Cairo_500Medium", fontSize: 12, marginTop: 4 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right" },
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
    marginTop: 4,
  },
  step: { flexDirection: "row-reverse", gap: 10, alignItems: "flex-start" },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  stepText: {
    flex: 1,
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
  },
  warning: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    textAlign: "right",
    lineHeight: 18,
  },
});
