import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  adminFetchAllApprovedProviders,
  type Provider,
} from "@/lib/data";
import { useT } from "@/lib/i18n";

type TabKind = "pending" | "active" | "all";

function isMoyasarActive(p: Provider): boolean {
  return p.moyasarStatus === "active";
}

/**
 * Normalise a Saudi phone number into a WhatsApp-friendly format.
 *   05xxxxxxxx → 9665xxxxxxxx
 *   +9665xxxxxxxx → 9665xxxxxxxx
 *   9665xxxxxxxx → 9665xxxxxxxx (unchanged)
 * Returns null if we can't parse it (caller should hide the button).
 */
function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("05")) return `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `966${digits}`;
  return null;
}

function buildFollowUpMessage(p: Provider, lang: string): string {
  const greeting = lang === "ar" ? "أهلاً" : "Hello";
  const storeName = p.name || p.nameAr || p.nameEn || "متجركم";
  if (lang === "ar") {
    return (
      `${greeting} ${storeName} 👋\n\n` +
      `نلاحظ أن متجركم "${storeName}" مُسجَّل على منصة فرحتكم لكن حساب ميسر للدفع لم يُربط بعد. لذلك المتجر لا يظهر للعملاء حالياً.\n\n` +
      `لتفعيل المتجر وبدء استقبال الحجوزات، يرجى تسجيل حساب ميسر للأعمال من هنا:\n` +
      `https://dashboard.moyasar.com/signup\n\n` +
      `ثم الدخول لتطبيق فرحتكم → واجهة مزوّد الخدمة → "ربط ميسر" وإدخال مفاتيح API.\n\n` +
      `أي استفسار نحن هنا للمساعدة. شكراً لكم 🌟`
    );
  }
  return (
    `${greeting} ${storeName} 👋\n\n` +
    `Your store "${storeName}" is registered on Farhatukum but Moyasar payments are not connected yet, so it isn't visible to customers.\n\n` +
    `To activate your store and start receiving bookings, please sign up for a Moyasar business account:\n` +
    `https://dashboard.moyasar.com/signup\n\n` +
    `Then open Farhatukum → Provider Zone → "Connect Moyasar" and enter your API keys.\n\n` +
    `Reach out if you need any help. Thank you 🌟`
  );
}

function openWhatsApp(phone: string, message: string) {
  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/${phone}?text=${encoded}`;
  Linking.openURL(url).catch(() => {});
}

export default function AdminMoyasarStatusScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";

  const [providers, setProviders] = useState<Provider[]>([]);
  const [tab, setTab] = useState<TabKind>("pending");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const list = await adminFetchAllApprovedProviders(lang);
      setProviders(list);
    } catch (e) {
      console.warn("[admin moyasar-status] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const counts = useMemo(() => {
    const active = providers.filter(isMoyasarActive).length;
    const pending = providers.length - active;
    return { active, pending, all: providers.length };
  }, [providers]);

  const filtered = useMemo(() => {
    if (tab === "active") return providers.filter(isMoyasarActive);
    if (tab === "pending") return providers.filter((p) => !isMoyasarActive(p));
    return providers;
  }, [providers, tab]);

  const tabs: { key: TabKind; label: string; count: number; color: string }[] = [
    {
      key: "pending",
      label: t("moyasarTabPending"),
      count: counts.pending,
      color: "#f59e0b",
    },
    {
      key: "active",
      label: t("moyasarTabActive"),
      count: counts.active,
      color: "#16a34a",
    },
    { key: "all", label: t("moyasarTabAll"), count: counts.all, color: c.primary },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("moyasarStatusTitle")} />

      <View style={[styles.tabsRow, { borderBottomColor: c.border }]}>
        {tabs.map((tb) => {
          const isActive = tb.key === tab;
          return (
            <Pressable
              key={tb.key}
              onPress={() => setTab(tb.key)}
              style={[
                styles.tabBtn,
                isActive && {
                  borderBottomColor: tb.color,
                  borderBottomWidth: 2,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? tb.color : c.mutedForeground,
                    fontFamily: isActive
                      ? "Cairo_700Bold"
                      : "Cairo_600SemiBold",
                  },
                ]}
              >
                {tb.label} ({tb.count})
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title={t("moyasarEmptyTitle")}
          body={t("moyasarEmptyBody")}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 12,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
            />
          }
        >
          {filtered.map((p) => {
            const active = isMoyasarActive(p);
            const waNumber = toWhatsAppNumber(p.phone);
            const statusColor = active ? "#16a34a" : "#f59e0b";
            const statusBg = active ? "#16a34a14" : "#f59e0b14";

            return (
              <Card key={p.id} style={{ gap: 12 }}>
                <View style={styles.headerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.storeName, { color: c.foreground }]}>
                      {p.name}
                    </Text>
                    <Text style={[styles.storeCity, { color: c.mutedForeground }]}>
                      {p.city || "—"}
                    </Text>
                  </View>
                  <View
                    style={[styles.statusBadge, { backgroundColor: statusBg }]}
                  >
                    <Feather
                      name={active ? "check-circle" : "alert-circle"}
                      size={12}
                      color={statusColor}
                    />
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {active ? t("moyasarActive") : t("moyasarNotConnected")}
                    </Text>
                  </View>
                </View>

                <View style={{ gap: 6 }}>
                  {p.email ? (
                    <View style={styles.infoRow}>
                      <Feather
                        name="mail"
                        size={13}
                        color={c.mutedForeground}
                      />
                      <Text style={[styles.infoText, { color: c.foreground }]}>
                        {p.email}
                      </Text>
                    </View>
                  ) : null}
                  {p.phone ? (
                    <View style={styles.infoRow}>
                      <Feather
                        name="phone"
                        size={13}
                        color={c.mutedForeground}
                      />
                      <Text style={[styles.infoText, { color: c.foreground }]}>
                        {p.phone}
                      </Text>
                    </View>
                  ) : null}
                  {p.iban ? (
                    <View style={styles.infoRow}>
                      <Feather
                        name="credit-card"
                        size={13}
                        color={c.mutedForeground}
                      />
                      <Text style={[styles.infoText, { color: c.foreground }]}>
                        {p.iban}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {!active && waNumber ? (
                  <Pressable
                    onPress={() =>
                      openWhatsApp(waNumber, buildFollowUpMessage(p, lang))
                    }
                    style={({ pressed }) => [
                      styles.waBtn,
                      { opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Feather name="message-circle" size={16} color="#ffffff" />
                    <Text style={styles.waBtnText}>
                      {t("moyasarSendWhatsApp")}
                    </Text>
                  </Pressable>
                ) : null}

                {!active && !waNumber ? (
                  <Text style={[styles.noPhoneNote, { color: c.mutedForeground }]}>
                    {t("moyasarNoPhone")}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabsRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 13,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 10,
  },
  storeName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
  storeCity: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
  },
  infoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
    flex: 1,
  },
  waBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#25D366",
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
  },
  waBtnText: {
    fontFamily: "Cairo_700Bold",
    color: "#ffffff",
    fontSize: 14,
  },
  noPhoneNote: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
});
