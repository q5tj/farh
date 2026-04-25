import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { useColors } from "@/hooks/useColors";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "md" | "lg" | "sm";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle | ViewStyle[];
  icon?: React.ReactNode;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  fullWidth = true,
  style,
  icon,
}: Props) {
  const c = useColors();

  const palette: Record<
    Variant,
    { bg: string; fg: string; border?: string }
  > = {
    primary: { bg: c.primary, fg: "#ffffff" },
    secondary: { bg: c.primaryBg, fg: c.primary },
    ghost: { bg: "transparent", fg: c.primary, border: c.border },
    destructive: { bg: c.destructive, fg: "#ffffff" },
  };
  const p = palette[variant];

  const heights: Record<Size, number> = { sm: 40, md: 50, lg: 56 };
  const fontSizes: Record<Size, number> = { sm: 14, md: 16, lg: 17 };

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: p.bg,
          borderColor: p.border ?? "transparent",
          borderWidth: p.border ? 1 : 0,
          height: heights[size],
          borderRadius: c.radius,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          width: fullWidth ? "100%" : undefined,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text
            style={[styles.label, { color: p.fg, fontSize: fontSizes[size] }]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: {},
  label: { fontFamily: "Cairo_600SemiBold", letterSpacing: 0.2 },
});
