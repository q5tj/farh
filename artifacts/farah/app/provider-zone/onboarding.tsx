import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
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
import { CITIES } from "@/constants/seedData";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { createProvider } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function ProviderOnboarding() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile, refreshProfile } = useAuth();
  const { categories, refresh } = useApp();

  // If user already has a provider record, skip the form.
  useEffect(() => {
    if (profile?.providerId) {
      router.replace("/provider-zone");
    }
  }, [profile?.providerId]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [city, setCity] = useState<string>(profile?.city ?? CITIES[0]);
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  // Auto-pick first category once loaded
  useEffect(() => {
    if (!categoryId && sortedCategories.length > 0) {
      setCategoryId(sortedCategories[0].id);
    }
  }, [categoryId, sortedCategories]);

  const submit = async () => {
    setError("");
    if (!profile) return;
    if (!name.trim()) {
      setError(t("enterBusinessName"));
      return;
    }
    if (!categoryId) {
      setError(t("pickCategory"));
      return;
    }
    setSubmitting(true);
    try {
      // 1) Create the provider row owned by the current user.
      await createProvider({
        userId: profile.id,
        categoryId,
        name: name.trim(),
        description: description.trim() || undefined,
        city: city || undefined,
        phone: phone.trim() || undefined,
        email: profile.email ?? undefined,
      });

      // 2) Promote user to "provider" role.
      if (isSupabaseConfigured && supabase && profile.role !== "provider") {
        const { error: roleErr } = await supabase
          .from("users")
          .update({ role: "provider" })
          .eq("id", profile.id);
        if (roleErr) throw roleErr;
      }

      await refreshProfile();
      await refresh();
      router.replace("/provider-zone");
    } catch (e) {
      const msg = (e as Error)?.message ?? t("createProviderFailed");
      setError(msg);
      if (Platform.OS !== "web") {
        Alert.alert(t("error"), msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("becomeProvider")}
        subtitle={t("providerOnboardingDesc")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/profile");
        }}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Card>
          <View style={styles.heroIcon}>
            <Feather name="briefcase" size={28} color={c.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: c.foreground }]}>
            {t("startBusinessTitle")}
          </Text>
          <Text style={[styles.heroDesc, { color: c.mutedForeground }]}>
            {t("startBusinessDesc")}
          </Text>
        </Card>

        <Input
          label={t("businessName")}
          placeholder={t("businessNameExample")}
          value={name}
          onChangeText={setName}
        />

        <Input
          label={t("shortBio")}
          placeholder={t("shortBioPlaceholder")}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          style={{ height: 90, textAlignVertical: "top" }}
        />

        <View>
          <Text style={[styles.label, { color: c.foreground }]}>{t("category")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          >
            {sortedCategories.map((cat) => {
              const active = categoryId === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategoryId(cat.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? c.primary : c.muted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? "#ffffff" : c.foreground },
                    ]}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View>
          <Text style={[styles.label, { color: c.foreground }]}>{t("city")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          >
            {CITIES.map((cityName) => {
              const active = city === cityName;
              return (
                <Pressable
                  key={cityName}
                  onPress={() => setCity(cityName)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? c.primary : c.muted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? "#ffffff" : c.foreground },
                    ]}
                  >
                    {cityName}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Input
          label={t("contactPhone")}
          placeholder="5XXXXXXXX"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        {error ? (
          <Text style={[styles.errorText, { color: c.destructive }]}>
            {error}
          </Text>
        ) : null}

        <View style={{ marginTop: 8 }}>
          <Button
            label={t("createProviderAccount")}
            onPress={submit}
            loading={submitting}
            size="lg"
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heroIcon: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(123,44,191,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 6,
  },
  heroDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 21,
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    marginBottom: 6,
    textAlign: "right",
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  errorText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
  },
});
