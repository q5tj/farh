import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Category } from "@/lib/data";
import { useColors } from "@/hooks/useColors";

export function CategoryPill({ category }: { category: Category }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => router.push(`/category/${category.slug}`)}
      style={({ pressed }) => [
        styles.wrap,
        {
          backgroundColor: c.card,
          borderColor: pressed ? category.color + "55" : c.border,
          borderRadius: 18,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
          shadowColor: category.color,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: pressed ? 0.18 : 0.06,
          shadowRadius: 8,
          elevation: pressed ? 3 : 1,
        },
      ]}
    >
      <View
        style={[styles.iconWrap, { backgroundColor: category.color + "1A" }]}
      >
        <Feather name={category.icon} size={24} color={category.color} />
      </View>
      <Text
        style={[styles.label, { color: c.foreground }]}
        numberOfLines={2}
      >
        {category.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "31%",
    minHeight: 112,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    gap: 10,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
});
