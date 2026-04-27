import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

interface Props {
  visible: boolean;
  onDismiss?: () => void;
}

/**
 * Full-screen overlay shown after a successful booking submit. The check
 * icon scales in with a slight bounce, the text fades in below, and the
 * card itself fades + slides up. Dismisses automatically after ~1.4s.
 */
export function BookingSuccessOverlay({ visible, onDismiss }: Props) {
  const c = useColors();
  const { t } = useT();
  const cardOpacity = useSharedValue(0);
  const cardTranslate = useSharedValue(20);
  const checkScale = useSharedValue(0);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      cardOpacity.value = 0;
      cardTranslate.value = 20;
      checkScale.value = 0;
      textOpacity.value = 0;
      return;
    }
    cardOpacity.value = withTiming(1, { duration: 200 });
    cardTranslate.value = withTiming(0, {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    });
    checkScale.value = withDelay(
      120,
      withSequence(
        withTiming(1.15, { duration: 280, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 140, easing: Easing.inOut(Easing.cubic) }),
      ),
    );
    textOpacity.value = withDelay(280, withTiming(1, { duration: 280 }));

    const dismissTimer = setTimeout(() => onDismiss?.(), 1500);
    return () => clearTimeout(dismissTimer);
  }, [visible, cardOpacity, cardTranslate, checkScale, textOpacity, onDismiss]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslate.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: c.background, borderRadius: c.radius },
            cardStyle,
          ]}
        >
          <Animated.View
            style={[styles.iconWrap, { backgroundColor: "#dcfce7" }, checkStyle]}
          >
            <Feather name="check" size={36} color="#16a34a" />
          </Animated.View>
          <Animated.View style={textStyle}>
            <Text style={[styles.title, { color: c.foreground }]}>
              {t("bookingSuccessTitle")}
            </Text>
            <Text style={[styles.desc, { color: c.mutedForeground }]}>
              {t("bookingSuccessDesc")}
            </Text>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
  desc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
  },
});
