import { FontAwesome } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

interface Props {
  value: number;
  size?: number;
  /**
   * If provided, renders the stars as a tappable rating selector and calls
   * `onChange(1..5)` when a star is tapped. Otherwise renders read-only.
   */
  onChange?: (v: number) => void;
  /**
   * Override fill color. Defaults to the app primary color (purple).
   * Pass a gold like "#fbbf24" for the more conventional review look.
   */
  color?: string;
  /** Outline color used for empty stars. Defaults to the fill color. */
  emptyColor?: string;
}

/**
 * Star rating display.
 *
 * - Filled vs. empty is decided per-star via `i <= Math.round(value)`.
 * - Filled stars use FontAwesome's solid `star`; empty stars use
 *   `star-o` (outline) so the silhouette stays visible at any size.
 * - In interactive mode each tap animates a small bounce on the tapped
 *   star — feels more responsive than the previous flat icon.
 */
export function Stars({ value, size = 16, onChange, color, emptyColor }: Props) {
  const c = useColors();
  const fillColor = color ?? c.primary;
  const outlineColor = emptyColor ?? fillColor;
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        if (onChange) {
          return (
            <BounceStar
              key={i}
              filled={filled}
              size={size}
              fillColor={fillColor}
              outlineColor={outlineColor}
              onPress={() => onChange(i)}
            />
          );
        }
        return (
          <FontAwesome
            key={i}
            name={filled ? "star" : "star-o"}
            size={size}
            color={filled ? fillColor : outlineColor}
            style={!filled ? styles.empty : undefined}
          />
        );
      })}
    </View>
  );
}

interface BounceStarProps {
  filled: boolean;
  size: number;
  fillColor: string;
  outlineColor: string;
  onPress: () => void;
}

function BounceStar({
  filled,
  size,
  fillColor,
  outlineColor,
  onPress,
}: BounceStarProps) {
  const scale = useSharedValue(1);
  const prevFilled = useRef(filled);
  // Bounce only on transition empty → filled. Skip the mount-time burst
  // so opening the screen with an existing rating doesn't shake all the
  // pre-filled stars at once.
  useEffect(() => {
    const wasFilled = prevFilled.current;
    prevFilled.current = filled;
    if (!filled || wasFilled) return;
    scale.value = withSequence(
      withTiming(1.25, { duration: 110, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 130, easing: Easing.inOut(Easing.cubic) }),
    );
  }, [filled, scale]);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Animated.View style={animStyle}>
        <FontAwesome
          name={filled ? "star" : "star-o"}
          size={size}
          color={filled ? fillColor : outlineColor}
          style={!filled ? styles.empty : undefined}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4 },
  empty: { opacity: 0.35 },
});
