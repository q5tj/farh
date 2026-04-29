import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { CITIES } from "@/constants/seedData";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  fetchProviderServiceAreas,
  setProviderServiceAreas,
} from "@/lib/data";
import { useT } from "@/lib/i18n";

export default function ProviderServiceAreasScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const providerId = profile?.providerId ?? null;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!providerId) return;
    (async () => {
      try {
        const cities = await fetchProviderServiceAreas(providerId);
        setSelected(new Set(cities));
      } finally {
        setInitialized(true);
      }
    })();
  }, [providerId]);

  const orderedCities = useMemo(() => CITIES, []);

  const toggle = (city: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });
  };

  const onSave = async () => {
    if (!providerId) return;
    if (selected.size === 0) {
      setError(t("pickAtLeastOneCity"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setProviderServiceAreas(providerId, Array.from(selected));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setError(msg);
      if (Platform.OS !== "web") Alert.alert(t("error"), msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("serviceAreasTitle")}
        subtitle={t("serviceAreasDesc")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/provider-zone");
        }}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          gap: 14,
        }}
      >
        {!initialized ? (
          <View style={{ paddingTop: 40, alignItems: "center" }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : (
          <>
            <View style={styles.chipsWrap}>
              {orderedCities.map((city) => {
                const active = selected.has(city);
                return (
                  <Pressable
                    key={city}
                    onPress={() => toggle(city)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? c.primary : c.muted,
                        borderColor: active ? c.primary : c.border,
                      },
                    ]}
                  >
                    {active ? (
                      <Feather name="check" size={14} color="#ffffff" />
                    ) : null}
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? "#ffffff" : c.foreground },
                      ]}
                    >
                      {city}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {error ? (
              <Text style={[styles.errorText, { color: c.destructive }]}>
                {error}
              </Text>
            ) : null}

            {savedFlash ? (
              <Text style={[styles.savedText, { color: c.primary }]}>
                ✓ {t("serviceAreasSaved")}
              </Text>
            ) : null}

            <Button
              label={t("filterApply")}
              onPress={onSave}
              loading={saving}
              size="lg"
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chipsWrap: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  errorText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
  },
  savedText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    textAlign: "right",
  },
});
