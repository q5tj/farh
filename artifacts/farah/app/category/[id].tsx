import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProviderCard } from "@/components/ProviderCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

export default function CategoryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Param `id` is the category slug (e.g. "halls", "photo").
  const slug = String(id);
  const { getCategoryBySlug, getProvidersByCategorySlug } = useApp();
  const category = getCategoryBySlug(slug);
  const providers = getProvidersByCategorySlug(slug);
  const isWeb = Platform.OS === "web";

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={category?.name ?? t("categoryFallbackTitle")}
        subtitle={`${providers.length} ${t("providers")}`}
      />
      {providers.length === 0 ? (
        <EmptyState
          icon="search"
          title={t("categoryEmptyTitle")}
          description={t("categoryEmptyDesc")}
          cta={{
            label: t("goBack"),
            onPress: () => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)");
            },
          }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            gap: 14,
            paddingBottom: isWeb ? 30 : insets.bottom + 30,
          }}
        >
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({});
