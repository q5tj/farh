import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProviderCard } from "@/components/ProviderCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

export default function FavoritesScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { favoriteIds, providers } = useApp();
  const isWeb = Platform.OS === "web";

  // Resolve favorite ids to provider objects (only those still in catalog).
  const favoriteProviders = useMemo(
    () => providers.filter((p) => favoriteIds.has(p.id)),
    [providers, favoriteIds],
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("favorites")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/profile");
        }}
      />
      {favoriteProviders.length === 0 ? (
        <EmptyState
          icon="heart"
          title={t("favoritesEmpty")}
          description={t("favoritesEmptyDesc")}
          cta={{
            label: t("exploreProviders"),
            onPress: () => router.replace("/(tabs)"),
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
          {favoriteProviders.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({});
