import React, { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

interface Props {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = "100%", height = 16, radius = 8, style }: Props) {
  const c = useColors();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.75, { duration: 850 }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as never,
          height,
          borderRadius: radius,
          backgroundColor: c.muted,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function ProviderCardSkeleton() {
  const c = useColors();
  return (
    <View style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <Skeleton height={160} radius={0} />
      <View style={{ padding: 14, gap: 8 }}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="50%" height={12} />
        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 4 }}>
          <Skeleton width={80} height={12} />
          <Skeleton width={100} height={14} />
        </View>
      </View>
    </View>
  );
}

export function BookingItemSkeleton() {
  const c = useColors();
  return (
    <View style={[styles.bookingItem, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={{ flexDirection: "row-reverse", gap: 12 }}>
        <Skeleton width={88} height={88} radius={12} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="65%" height={14} />
          <Skeleton width="50%" height={11} />
          <Skeleton width="80%" height={11} />
        </View>
      </View>
    </View>
  );
}

export function CategoryPillSkeleton() {
  const c = useColors();
  return (
    <View style={[styles.pill, { borderColor: c.border, backgroundColor: c.card }]}>
      <Skeleton width={48} height={48} radius={24} />
      <Skeleton width="60%" height={11} />
    </View>
  );
}

/**
 * Wrap content that replaces a skeleton — fades it in over 250ms.
 * Use as: `<FadeIntoView>{realContent}</FadeIntoView>`
 *
 * We deliberately don't pass `.easing(Easing.out(Easing.cubic))` because
 * Reanimated's layout-animation runtime on web only supports linear
 * easing — passing a bezier curve emits a noisy warning on every mount
 * and silently falls back to linear anyway. The default Reanimated curve
 * is a good-enough fade-in on both platforms.
 */
export function FadeIntoView({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      exiting={FadeOut.duration(180)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderWidth: 1,
    overflow: "hidden",
    borderRadius: 12,
  },
  bookingItem: {
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
    borderRadius: 12,
  },
  pill: {
    width: "31%",
    minHeight: 110,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    gap: 10,
  },
});
