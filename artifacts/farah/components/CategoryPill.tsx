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
          borderColor: c.border,
          borderRadius: c.radius,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View
        style={[styles.iconWrap, { backgroundColor: category.color + "1A" }]}
      >
        <Feather name={category.icon} size={22} color={category.color} />
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
    minHeight: 110,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    gap: 10,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
