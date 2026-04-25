import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

interface Props {
  value: number;
  size?: number;
  onChange?: (v: number) => void;
  color?: string;
}

export function Stars({ value, size = 16, onChange, color = "#fbbf24" }: Props) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        const Icon = (
          <Feather name="star" size={size} color={color} style={{ opacity: filled ? 1 : 0.25 }} />
        );
        if (onChange) {
          return (
            <Pressable key={i} onPress={() => onChange(i)} hitSlop={6}>
              {Icon}
            </Pressable>
          );
        }
        return <View key={i}>{Icon}</View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 3 },
});
