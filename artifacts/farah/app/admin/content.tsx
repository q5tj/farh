import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useColors } from "@/hooks/useColors";
import {
  adminUpdateAppContent,
  fetchAppContent,
  type AppContentEntry,
} from "@/lib/data";
import { infoDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";

export default function AdminContentScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const TITLES: Record<string, string> = {
    about_idea: t("aboutIdea"),
    about_goal: t("aboutGoal"),
    about_how: t("aboutHow"),
  };

  const [entries, setEntries] = useState<AppContentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { ar: string; en: string }>
  >({});

  useEffect(() => {
    let alive = true;
    fetchAppContent()
      .then((list) => {
        if (!alive) return;
        setEntries(list);
        const map: Record<string, { ar: string; en: string }> = {};
        list.forEach((e) => {
          map[e.key] = { ar: e.valueAr, en: e.valueEn };
        });
        setDrafts(map);
      })
      .catch((e) => console.warn("[admin content] failed", e))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const updateDraft = (key: string, lang: "ar" | "en", value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], [lang]: value },
    }));
  };

  const save = async (key: string) => {
    setSaving(key);
    try {
      const draft = drafts[key];
      if (!draft) return;
      await adminUpdateAppContent(key, {
        valueAr: draft.ar,
        valueEn: draft.en,
      });
      const refreshed = await fetchAppContent();
      setEntries(refreshed);
      await infoDialog({ title: t("done"), message: t("contentSaveSuccess") });
    } catch (e) {
      const msg = (e as Error).message ?? t("contentSaveFailed");
      await infoDialog({ title: t("error"), message: msg });
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("contentScreenTitle")} />
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
        >
          <Text style={[styles.hint, { color: c.mutedForeground }]}>
            {t("contentEditHint")}
          </Text>

          {entries.map((entry) => {
            const draft = drafts[entry.key] ?? {
              ar: entry.valueAr,
              en: entry.valueEn,
            };
            const dirty =
              draft.ar !== entry.valueAr || draft.en !== entry.valueEn;
            return (
              <Card key={entry.key}>
                <Text style={[styles.cardTitle, { color: c.foreground }]}>
                  {TITLES[entry.key] ?? entry.key}
                </Text>
                <Text
                  style={[styles.cardKey, { color: c.mutedForeground }]}
                >
                  {entry.key}
                </Text>

                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.label, { color: c.foreground }]}>
                    {t("contentArabic")}
                  </Text>
                  <View
                    style={[
                      styles.textareaWrap,
                      {
                        backgroundColor: c.background,
                        borderColor: c.border,
                        borderRadius: c.radius - 4,
                      },
                    ]}
                  >
                    <Input
                      placeholder={t("contentArPlaceholder")}
                      value={draft.ar}
                      onChangeText={(v) => updateDraft(entry.key, "ar", v)}
                      multiline
                      numberOfLines={4}
                      style={{ height: 100, textAlignVertical: "top" }}
                      maxLength={2000}
                    />
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.label, { color: c.foreground }]}>
                    {t("contentEnglish")}
                  </Text>
                  <View
                    style={[
                      styles.textareaWrap,
                      {
                        backgroundColor: c.background,
                        borderColor: c.border,
                        borderRadius: c.radius - 4,
                      },
                    ]}
                  >
                    <Input
                      placeholder={t("contentEnPlaceholder")}
                      value={draft.en}
                      onChangeText={(v) => updateDraft(entry.key, "en", v)}
                      multiline
                      numberOfLines={4}
                      style={{ height: 100, textAlignVertical: "top" }}
                      maxLength={2000}
                    />
                  </View>
                </View>

                <View style={{ marginTop: 14 }}>
                  <Button
                    label={dirty ? t("contentSave") : t("contentSaved")}
                    onPress={() => save(entry.key)}
                    loading={saving === entry.key}
                    disabled={!dirty}
                    variant={dirty ? "primary" : "secondary"}
                  />
                </View>
              </Card>
            );
          })}

          {entries.length === 0 ? (
            <Text style={[styles.hint, { color: c.mutedForeground }]}>
              {t("contentEmpty")}
            </Text>
          ) : null}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { paddingTop: 60, alignItems: "center" },
  hint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
  },
  cardTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    textAlign: "right",
  },
  cardKey: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 2,
    textAlign: "right",
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    marginBottom: 6,
    textAlign: "right",
  },
  textareaWrap: { borderWidth: 1, padding: 0 },
});
