import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  adminSavePaymentSettings,
  adminUpdateAppContent,
  fetchAppContent,
  fetchPaymentSettings,
  type AppContentEntry,
  type PaymentSettings,
} from "@/lib/data";
import { infoDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";

/**
 * Consolidated admin settings hub.
 * Sections: Commission, Legal docs (terms + privacy), About app, System info.
 * Bilingual editors are inline (collapsed by default) to keep the screen short.
 */
export default function AdminSettings() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { commissionRate, setCommissionRate } = useApp();

  const [commissionInput, setCommissionInput] = useState(
    String(commissionRate),
  );
  const [savedFlash, setSavedFlash] = useState(false);

  const [entries, setEntries] = useState<Record<string, AppContentEntry>>({});
  const [loadingContent, setLoadingContent] = useState(true);

  // Payment settings (deposit %, app share %, cancellation windows).
  const [paySettings, setPaySettings] = useState<PaymentSettings | null>(null);
  const [paySaving, setPaySaving] = useState(false);
  const [paySavedFlash, setPaySavedFlash] = useState(false);
  const [depositPctInput, setDepositPctInput] = useState("");
  const [appShareInput, setAppShareInput] = useState("");
  const [fullWindowInput, setFullWindowInput] = useState("");
  const [halfWindowInput, setHalfWindowInput] = useState("");

  useEffect(() => {
    let alive = true;
    fetchPaymentSettings()
      .then((s) => {
        if (!alive) return;
        setPaySettings(s);
        setDepositPctInput(String(s.depositPercentage));
        setAppShareInput(String(s.appShareFromDeposit));
        setFullWindowInput(String(s.cancellationWindowFullDays));
        setHalfWindowInput(String(s.cancellationWindowHalfDays));
      })
      .catch((e) => console.warn("[admin settings] payment fetch", e));
    return () => {
      alive = false;
    };
  }, []);

  const savePaymentSettings = async () => {
    setPaySaving(true);
    try {
      const patch: Partial<PaymentSettings> = {
        depositPercentage: Math.max(0, Math.min(100, Number(depositPctInput) || 0)),
        appShareFromDeposit: Math.max(0, Math.min(100, Number(appShareInput) || 0)),
        cancellationWindowFullDays: Math.max(0, Math.min(60, Number(fullWindowInput) || 0)),
        cancellationWindowHalfDays: Math.max(0, Math.min(60, Number(halfWindowInput) || 0)),
      };
      await adminSavePaymentSettings(patch);
      setPaySettings({
        depositPercentage: patch.depositPercentage!,
        appShareFromDeposit: patch.appShareFromDeposit!,
        cancellationWindowFullDays: patch.cancellationWindowFullDays!,
        cancellationWindowHalfDays: patch.cancellationWindowHalfDays!,
      });
      setPaySavedFlash(true);
      setTimeout(() => setPaySavedFlash(false), 2000);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      await infoDialog({ title: t("error"), message: msg });
    } finally {
      setPaySaving(false);
    }
  };

  useEffect(() => {
    let alive = true;
    fetchAppContent()
      .then((list) => {
        if (!alive) return;
        const map: Record<string, AppContentEntry> = {};
        list.forEach((e) => {
          map[e.key] = e;
        });
        setEntries(map);
      })
      .catch((e) => console.warn("[admin settings] content fetch failed", e))
      .finally(() => {
        if (alive) setLoadingContent(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const saveCommission = async () => {
    const n = Math.max(0, Math.min(50, Number(commissionInput) || 0));
    await setCommissionRate(n);
    setCommissionInput(String(n));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const onContentSaved = (entry: AppContentEntry) => {
    setEntries((prev) => ({ ...prev, [entry.key]: entry }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("appSettingsTitle")}
        subtitle={t("appSettingsDesc")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/admin");
        }}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 30,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        {/* === Commission === */}
        <Card>
          <SectionHeader
            icon="percent"
            title={t("appSettingsCommissionSection")}
          />
          <Text style={[styles.desc, { color: c.mutedForeground }]}>
            {t("settingsCommissionDescription")}
          </Text>
          <View style={{ marginTop: 12 }}>
            <Input
              label={t("commissionLabel")}
              value={commissionInput}
              onChangeText={setCommissionInput}
              keyboardType="numeric"
              maxLength={4}
            />
          </View>
          <View style={{ marginTop: 12 }}>
            <Button
              label={savedFlash ? t("savedCheck") : t("saveChanges")}
              onPress={saveCommission}
              variant={savedFlash ? "secondary" : "primary"}
            />
          </View>
        </Card>

        {/* === Payment policy === */}
        <Card>
          <SectionHeader icon="credit-card" title={t("paymentSettingsTitle")} />
          <Text style={[styles.desc, { color: c.mutedForeground }]}>
            {t("paymentSettingsDesc")}
          </Text>
          {!paySettings ? (
            <ActivityIndicator color={c.primary} style={{ marginTop: 12 }} />
          ) : (
            <View style={{ gap: 12, marginTop: 12 }}>
              <Input
                label={t("depositPercentageLabel")}
                value={depositPctInput}
                onChangeText={setDepositPctInput}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={[styles.helper, { color: c.mutedForeground }]}>
                {t("depositPercentageHelp")}
              </Text>

              <Input
                label={t("appShareFromDepositLabel")}
                value={appShareInput}
                onChangeText={setAppShareInput}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={[styles.helper, { color: c.mutedForeground }]}>
                {t("appShareFromDepositHelp")}
              </Text>

              <Input
                label={t("cancellationFullWindowLabel")}
                value={fullWindowInput}
                onChangeText={setFullWindowInput}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={[styles.helper, { color: c.mutedForeground }]}>
                {t("cancellationFullWindowHelp")}
              </Text>

              <Input
                label={t("cancellationHalfWindowLabel")}
                value={halfWindowInput}
                onChangeText={setHalfWindowInput}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={[styles.helper, { color: c.mutedForeground }]}>
                {t("cancellationHalfWindowHelp")}
              </Text>

              <View style={{ marginTop: 6 }}>
                <Button
                  label={paySavedFlash ? t("savedCheck") : t("saveChanges")}
                  onPress={savePaymentSettings}
                  loading={paySaving}
                  variant={paySavedFlash ? "secondary" : "primary"}
                />
              </View>
            </View>
          )}
        </Card>

        {/* === Legal documents === */}
        <Card>
          <SectionHeader
            icon="file-text"
            title={t("appSettingsLegalSection")}
          />
          {loadingContent ? (
            <ActivityIndicator color={c.primary} style={{ marginTop: 12 }} />
          ) : (
            <View style={{ gap: 14, marginTop: 12 }}>
              <BilingualEditor
                entry={entries.terms_conditions}
                fallbackKey="terms_conditions"
                title={t("appSettingsEditTerms")}
                onSaved={onContentSaved}
              />
              <BilingualEditor
                entry={entries.privacy_policy}
                fallbackKey="privacy_policy"
                title={t("appSettingsEditPrivacy")}
                onSaved={onContentSaved}
              />
            </View>
          )}
        </Card>

        {/* === About app === */}
        <Card>
          <SectionHeader
            icon="info"
            title={t("appSettingsAboutSection")}
          />
          {loadingContent ? (
            <ActivityIndicator color={c.primary} style={{ marginTop: 12 }} />
          ) : (
            <View style={{ gap: 14, marginTop: 12 }}>
              <BilingualEditor
                entry={entries.about_idea}
                fallbackKey="about_idea"
                title={t("aboutIdea")}
                onSaved={onContentSaved}
              />
              <BilingualEditor
                entry={entries.about_goal}
                fallbackKey="about_goal"
                title={t("aboutGoal")}
                onSaved={onContentSaved}
              />
              <BilingualEditor
                entry={entries.about_how}
                fallbackKey="about_how"
                title={t("aboutHow")}
                onSaved={onContentSaved}
              />
            </View>
          )}
        </Card>

        {/* === System info === */}
        <Card>
          <SectionHeader
            icon="cpu"
            title={t("appSettingsSystemSection")}
          />
          <View style={{ marginTop: 12, gap: 10 }}>
            <InfoRow label={t("settingsRowVersion")} value="1.0.0" />
            <InfoRow
              label={t("settingsRowStatus")}
              value={t("settingsRowStatusActive")}
              valueColor="#16a34a"
            />
            <InfoRow
              label={t("settingsRowStorage")}
              value={t("settingsRowStorageValue")}
            />
          </View>
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}

function SectionHeader({
  icon,
  title,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
}) {
  const c = useColors();
  return (
    <View style={styles.sectionHead}>
      <Feather name={icon} size={18} color={c.primary} />
      <Text style={[styles.sectionTitle, { color: c.foreground }]}>
        {title}
      </Text>
    </View>
  );
}

function BilingualEditor({
  entry,
  fallbackKey,
  title,
  onSaved,
}: {
  entry: AppContentEntry | undefined;
  fallbackKey: string;
  title: string;
  onSaved: (entry: AppContentEntry) => void;
}) {
  const c = useColors();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [ar, setAr] = useState(entry?.valueAr ?? "");
  const [en, setEn] = useState(entry?.valueEn ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAr(entry?.valueAr ?? "");
    setEn(entry?.valueEn ?? "");
  }, [entry]);

  const dirty = entry ? ar !== entry.valueAr || en !== entry.valueEn : true;

  const save = async () => {
    setSaving(true);
    try {
      await adminUpdateAppContent(fallbackKey, { valueAr: ar, valueEn: en });
      onSaved({
        key: fallbackKey,
        valueAr: ar,
        valueEn: en,
        updatedAt: new Date().toISOString(),
      });
      await infoDialog({ title: t("done"), message: t("contentSaveSuccess") });
    } catch (e) {
      const msg = (e as Error).message ?? t("contentSaveFailed");
      await infoDialog({ title: t("error"), message: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.editor, { borderColor: c.border }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.editorHead}
      >
        <Feather
          name={open ? "chevron-down" : "chevron-left"}
          size={16}
          color={c.mutedForeground}
        />
        <Text style={[styles.editorTitle, { color: c.foreground }]}>
          {title}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 10, marginTop: 10 }}>
          <View>
            <Text style={[styles.editorLabel, { color: c.foreground }]}>
              {t("contentArabic")}
            </Text>
            <Input
              placeholder={t("contentArPlaceholder")}
              value={ar}
              onChangeText={setAr}
              multiline
              numberOfLines={4}
              style={{ height: 110, textAlignVertical: "top" }}
              maxLength={4000}
            />
          </View>
          <View>
            <Text style={[styles.editorLabel, { color: c.foreground }]}>
              {t("contentEnglish")}
            </Text>
            <Input
              placeholder={t("contentEnPlaceholder")}
              value={en}
              onChangeText={setEn}
              multiline
              numberOfLines={4}
              style={{ height: 110, textAlignVertical: "top" }}
              maxLength={4000}
            />
          </View>
          <Button
            label={dirty ? t("contentSave") : t("contentSaved")}
            onPress={save}
            loading={saving}
            disabled={!dirty}
            variant={dirty ? "primary" : "secondary"}
          />
        </View>
      ) : null}
    </View>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const c = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: c.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.infoValue, { color: valueColor ?? c.foreground }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
  desc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    marginTop: 6,
    lineHeight: 21,
    textAlign: "right",
  },
  helper: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: -6,
    lineHeight: 17,
    textAlign: "right",
  },
  editor: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  editorHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  editorTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  editorLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    marginBottom: 6,
    textAlign: "right",
  },
  infoRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: { fontFamily: "Cairo_500Medium", fontSize: 13 },
  infoValue: { fontFamily: "Cairo_700Bold", fontSize: 13 },
});
