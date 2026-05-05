import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  adminApproveProvider,
  adminFetchProvidersByStatus,
  adminRejectProvider,
  adminRequestProviderUpdate,
  type Provider,
  type VerificationStatus,
} from "@/lib/data";
import { useT } from "@/lib/i18n";
import { getSignedDocUrl } from "@/lib/image-upload";

export default function AdminVerificationsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";

  const [tab, setTab] = useState<VerificationStatus>("pending");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Decision modal: either a final reject OR a request-for-update.
  const [decisionTarget, setDecisionTarget] = useState<{
    providerId: string;
    mode: "reject" | "needs_update";
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");

  const load = async () => {
    try {
      const list = await adminFetchProvidersByStatus(tab, lang);
      setProviders(list);
    } catch (e) {
      console.warn("[admin verifications] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, lang]);

  const tabs: {
    id: VerificationStatus;
    labelKey:
      | "pendingTab"
      | "approvedTab"
      | "rejectedTab"
      | "needsUpdateTab";
  }[] = useMemo(
    () => [
      { id: "pending", labelKey: "pendingTab" },
      { id: "needs_update", labelKey: "needsUpdateTab" },
      { id: "approved", labelKey: "approvedTab" },
      { id: "rejected", labelKey: "rejectedTab" },
    ],
    [],
  );

  const onApprove = async (provider: Provider) => {
    setBusyId(provider.id);
    try {
      await adminApproveProvider(provider.id);
      if (Platform.OS !== "web") {
        Alert.alert(t("verificationApproved"), provider.name);
      }
      await load();
    } catch (e) {
      const msg = (e as Error).message ?? t("verificationActionFailed");
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(msg);
      } else {
        Alert.alert(t("error"), msg);
      }
    } finally {
      setBusyId(null);
    }
  };

  const openDecisionModal = (
    provider: Provider,
    mode: "reject" | "needs_update",
  ) => {
    setDecisionReason("");
    setDecisionTarget({ providerId: provider.id, mode });
  };

  const submitDecision = async () => {
    if (!decisionTarget) return;
    const { providerId, mode } = decisionTarget;
    const reason = decisionReason.trim();
    if (mode === "needs_update" && !reason) {
      const msg = t("requestUpdateReasonRequired");
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(msg);
      } else {
        Alert.alert(t("error"), msg);
      }
      return;
    }
    setBusyId(providerId);
    try {
      if (mode === "reject") {
        await adminRejectProvider(providerId, reason);
      } else {
        await adminRequestProviderUpdate(providerId, reason);
      }
      setDecisionTarget(null);
      setDecisionReason("");
      await load();
    } catch (e) {
      const msg = (e as Error).message ?? t("verificationActionFailed");
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(msg);
      } else {
        Alert.alert(t("error"), msg);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("adminVerifications")} />

      <View style={[styles.tabsBar, { borderBottomColor: c.border }]}>
        {tabs.map((tb) => {
          const active = tab === tb.id;
          return (
            <Pressable
              key={tb.id}
              onPress={() => setTab(tb.id)}
              style={[
                styles.tabBtn,
                { borderBottomColor: active ? c.primary : "transparent" },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: active ? c.primary : c.mutedForeground,
                    fontFamily: active ? "Cairo_700Bold" : "Cairo_500Medium",
                  },
                ]}
              >
                {t(tb.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : providers.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title={
            tab === "pending"
              ? t("noPendingVerifications")
              : t("auditEmpty")
          }
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
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={c.primary}
            />
          }
        >
          {providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              busy={busyId === p.id}
              onApprove={() => onApprove(p)}
              onRequestUpdate={() => openDecisionModal(p, "needs_update")}
              onReject={() => openDecisionModal(p, "reject")}
              showActions={tab === "pending"}
            />
          ))}
        </ScrollView>
      )}

      <Modal
        visible={decisionTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => !busyId && setDecisionTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalContainer}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.modalCard,
                { backgroundColor: c.background, borderRadius: c.radius },
              ]}
            >
              <Text style={[styles.modalTitle, { color: c.foreground }]}>
                {decisionTarget?.mode === "needs_update"
                  ? t("requestUpdateConfirmTitle")
                  : t("finalRejectConfirmTitle")}
              </Text>
              <Text
                style={[styles.modalHint, { color: c.mutedForeground }]}
              >
                {decisionTarget?.mode === "needs_update"
                  ? t("requestUpdateHint")
                  : t("finalRejectHint")}
              </Text>
              <Text style={[styles.label, { color: c.foreground }]}>
                {decisionTarget?.mode === "needs_update"
                  ? t("requestUpdateReasonLabel")
                  : t("rejectReasonLabel")}
              </Text>
              <Input
                placeholder={
                  decisionTarget?.mode === "needs_update"
                    ? t("requestUpdateReasonPlaceholder")
                    : t("rejectReasonPlaceholder")
                }
                value={decisionReason}
                onChangeText={setDecisionReason}
                multiline
                numberOfLines={4}
                style={{ height: 100, textAlignVertical: "top" }}
                maxLength={500}
              />
              <View
                style={{
                  flexDirection: "row-reverse",
                  gap: 10,
                  marginTop: 18,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Button
                    label={
                      decisionTarget?.mode === "needs_update"
                        ? t("requestUpdate")
                        : t("finalReject")
                    }
                    onPress={submitDecision}
                    loading={busyId !== null}
                    variant="primary"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("cancel")}
                    variant="ghost"
                    onPress={() => !busyId && setDecisionTarget(null)}
                  />
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </View>
  );
}

function ProviderRow({
  provider,
  busy,
  onApprove,
  onRequestUpdate,
  onReject,
  showActions,
}: {
  provider: Provider;
  busy: boolean;
  onApprove: () => void;
  onRequestUpdate: () => void;
  onReject: () => void;
  showActions: boolean;
}) {
  const c = useColors();
  const { t } = useT();
  const statusColors: Record<VerificationStatus, { bg: string; fg: string }> = {
    pending: { bg: "#fef3c7", fg: "#a16207" },
    approved: { bg: "#dcfce7", fg: "#166534" },
    rejected: { bg: "#fee2e2", fg: "#991b1b" },
    needs_update: { bg: "#dbeafe", fg: "#1d4ed8" },
  };
  const sc = statusColors[provider.verificationStatus];

  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: c.primaryBg }]}>
          {provider.logoUrl ? (
            <Image
              source={{ uri: provider.logoUrl }}
              style={styles.avatarImage}
            />
          ) : (
            <Feather name="briefcase" size={18} color={c.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: c.foreground }]}>
            {provider.name}
          </Text>
          <Text
            style={[styles.meta, { color: c.mutedForeground }]}
            numberOfLines={1}
          >
            {provider.city}
            {provider.phone ? ` • ${provider.phone}` : ""}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.fg }]}>
            {t(
              provider.verificationStatus === "approved"
                ? "approvedTab"
                : provider.verificationStatus === "rejected"
                  ? "rejectedTab"
                  : provider.verificationStatus === "needs_update"
                    ? "needsUpdateTab"
                    : "pendingTab",
            )}
          </Text>
        </View>
      </View>

      {provider.description ? (
        <Text
          style={[styles.desc, { color: c.mutedForeground }]}
          numberOfLines={3}
        >
          {provider.description}
        </Text>
      ) : null}

      {provider.commissionRateSnapshot != null ? (
        <View style={[styles.commissionRow, { borderColor: c.border }]}>
          <Feather name="percent" size={12} color={c.mutedForeground} />
          <Text style={[styles.commissionText, { color: c.mutedForeground }]}>
            {t("adminCommissionSnapshot")}: {provider.commissionRateSnapshot}%
          </Text>
        </View>
      ) : null}

      <DocsBlock provider={provider} />

      {showActions ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          <Button
            label={t("approve")}
            onPress={onApprove}
            loading={busy}
            icon={<Feather name="check" size={16} color="#ffffff" />}
          />
          <Button
            label={t("requestUpdate")}
            onPress={onRequestUpdate}
            variant="secondary"
            icon={<Feather name="edit-3" size={16} color={c.primary} />}
          />
          <Button
            label={t("finalReject")}
            onPress={onReject}
            variant="ghost"
            icon={<Feather name="x" size={16} color={c.destructive} />}
          />
        </View>
      ) : null}
    </Card>
  );
}

interface DocItem {
  key: "logo" | "cr" | "tax" | "address";
  labelKey:
    | "adminDocLogo"
    | "adminDocCR"
    | "adminDocTax"
    | "adminDocAddress";
  url: string | null;
  loading: boolean;
}

function DocsBlock({ provider }: { provider: Provider }) {
  const c = useColors();
  const { t } = useT();
  const [docs, setDocs] = useState<DocItem[]>([
    { key: "logo", labelKey: "adminDocLogo", url: null, loading: true },
    { key: "cr", labelKey: "adminDocCR", url: null, loading: true },
    { key: "tax", labelKey: "adminDocTax", url: null, loading: true },
    { key: "address", labelKey: "adminDocAddress", url: null, loading: true },
  ]);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [logoUrl, crUrl, taxUrl, addrUrl] = await Promise.all([
        Promise.resolve(provider.logoUrl ?? null),
        provider.commercialRegistrationPath
          ? getSignedDocUrl("provider-docs", provider.commercialRegistrationPath)
          : Promise.resolve(null),
        provider.taxNumberPath
          ? getSignedDocUrl("provider-docs", provider.taxNumberPath)
          : Promise.resolve(null),
        provider.nationalAddressPath
          ? getSignedDocUrl("provider-docs", provider.nationalAddressPath)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setDocs([
        { key: "logo", labelKey: "adminDocLogo", url: logoUrl, loading: false },
        { key: "cr", labelKey: "adminDocCR", url: crUrl, loading: false },
        { key: "tax", labelKey: "adminDocTax", url: taxUrl, loading: false },
        {
          key: "address",
          labelKey: "adminDocAddress",
          url: addrUrl,
          loading: false,
        },
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    provider.id,
    provider.logoUrl,
    provider.commercialRegistrationPath,
    provider.taxNumberPath,
    provider.nationalAddressPath,
  ]);

  return (
    <View style={[styles.docsBlock, { borderColor: c.border }]}>
      <Text style={[styles.docsTitle, { color: c.foreground }]}>
        {t("adminDocumentsTitle")}
      </Text>
      <View style={styles.docsGrid}>
        {docs.map((d) => (
          <View key={d.key} style={styles.docCol}>
            <Pressable
              disabled={!d.url || d.loading}
              onPress={() => d.url && setViewerUrl(d.url)}
              style={[
                styles.docThumb,
                { borderColor: c.border, backgroundColor: c.muted },
              ]}
            >
              {d.loading ? (
                <ActivityIndicator size="small" color={c.primary} />
              ) : d.url ? (
                <Image source={{ uri: d.url }} style={styles.docImg} />
              ) : (
                <Feather name="image" size={20} color={c.mutedForeground} />
              )}
            </Pressable>
            <Text
              style={[styles.docCaption, { color: c.foreground }]}
              numberOfLines={1}
            >
              {t(d.labelKey)}
            </Text>
            {!d.loading && !d.url ? (
              <Text
                style={[styles.docMissing, { color: c.mutedForeground }]}
                numberOfLines={1}
              >
                {t("adminDocMissing")}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <Modal
        visible={viewerUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUrl(null)}
      >
        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => setViewerUrl(null)}
        >
          {viewerUrl ? (
            <Image
              source={{ uri: viewerUrl }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : null}
          <View style={styles.viewerCloseHint}>
            <Feather name="x" size={20} color="#ffffff" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  tabsBar: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
  },
  tabText: { fontSize: 13 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  commissionRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commissionText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    textAlign: "right",
  },
  docsBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  docsTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    textAlign: "right",
    marginBottom: 10,
  },
  docsGrid: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  docCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  docThumb: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  docImg: { width: "100%", height: "100%", resizeMode: "cover" },
  docCaption: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    textAlign: "center",
  },
  docMissing: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    textAlign: "center",
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImage: {
    width: "100%",
    height: "100%",
  },
  viewerCloseHint: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  meta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  statusText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  desc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 12,
    lineHeight: 19,
    textAlign: "right",
  },
  actions: {
    flexDirection: "row-reverse",
    gap: 10,
    marginTop: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
  },
  modalContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    padding: 20,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
    marginBottom: 8,
  },
  modalHint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "right",
    marginBottom: 14,
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "right",
  },
});
