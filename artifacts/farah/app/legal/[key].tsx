import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { fetchAppContentByKey, type AppContentEntry } from "@/lib/data";
import { useT } from "@/lib/i18n";

export default function LegalScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";
  const { key } = useLocalSearchParams<{ key: string }>();
  const docKey = String(key ?? "terms_conditions");

  const [entry, setEntry] = useState<AppContentEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchAppContentByKey(docKey)
      .then((row) => {
        if (alive) setEntry(row);
      })
      .catch((e) => console.warn("[legal] fetch failed", e))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [docKey]);

  const title =
    docKey === "terms_conditions"
      ? t("termsConditionsTitle")
      : docKey === "privacy_policy"
        ? t("privacyPolicyTitle")
        : docKey;

  const body = entry
    ? lang === "en"
      ? entry.valueEn?.trim() || entry.valueAr
      : entry.valueAr?.trim() || entry.valueEn
    : "";

  const updatedLabel = entry
    ? t("termsLastUpdated", {
        date: new Date(entry.updatedAt).toLocaleDateString(
          lang === "en" ? "en-US" : "ar-SA",
        ),
      })
    : "";

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={title}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)");
        }}
      />
      {loading ? (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 30,
          }}
        >
          <Text style={[styles.body, { color: c.foreground }]}>
            {body || "—"}
          </Text>
          {entry ? (
            <Text style={[styles.updated, { color: c.mutedForeground }]}>
              {updatedLabel}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    lineHeight: 24,
    textAlign: "right",
  },
  updated: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    marginTop: 24,
    textAlign: "right",
  },
});
