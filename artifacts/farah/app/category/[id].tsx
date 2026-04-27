import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProviderCard } from "@/components/ProviderCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

export default function CategoryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
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
        title={category?.name ?? "تصنيف"}
        subtitle={`${providers.length} مزود خدمة`}
      />
      {providers.length === 0 ? (
        <EmptyState
          icon="search"
          title="لا يوجد مزودون لهذا التصنيف بعد"
          description="نعمل على إضافة المزيد من مزودي الخدمة قريباً"
          cta={{ label: "العودة", onPress: () => router.back() }}
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
