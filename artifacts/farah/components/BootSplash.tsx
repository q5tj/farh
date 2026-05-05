import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

/**
 * App boot screen — shown while AuthContext bootstraps the session.
 *
 * Important: this component must be safe to render *before* native modules
 * are warmed up. We deliberately avoid:
 *   - Reanimated (depends on worklet plugin + native lib init)
 *   - LinearGradient (native module that occasionally fails to mount on
 *     iOS first-launch, leaving a white screen)
 *   - useColors / contexts (might not exist yet during early boot)
 *
 * Everything below uses plain React Native primitives (Animated, View,
 * Image, Text) so the splash always renders, even if native modules
 * aren't fully ready.
 */
export function BootSplash() {
  // Logo: gentle pulse (scale + alpha) on a 1.6s loop.
  const pulse = useRef(new Animated.Value(0)).current;
  // Spinner: continuous rotation.
  const spin = useRef(new Animated.Value(0)).current;
  // Caption: fade in after a beat.
  const caption = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const captionAnim = Animated.timing(caption, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    pulseLoop.start();
    spinLoop.start();
    captionAnim.start();
    return () => {
      pulseLoop.stop();
      spinLoop.stop();
      captionAnim.stop();
    };
  }, [pulse, spin, caption]);

  const logoScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const logoOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });
  const spinDeg = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const captionTranslateY = caption.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  return (
    <View style={styles.root}>
      {/* Solid layered backgrounds give a "gradient" feel without needing
          expo-linear-gradient (which is a native module that can flake on
          iOS first-launch, producing a white screen). */}
      <View style={[styles.layer, { backgroundColor: "#7b2cbf" }]} />
      <View
        style={[
          styles.layer,
          { backgroundColor: "rgba(60, 9, 108, 0.55)", top: "55%" },
        ]}
      />

      <View style={styles.center}>
        <Animated.View
          style={[
            styles.logoWrap,
            { transform: [{ scale: logoScale }], opacity: logoOpacity },
          ]}
        >
          <View style={styles.logoHalo}>
            <View style={styles.logoCircle}>
              <Image
                source={require("../assets/images/icon.png")}
                style={styles.logo}
              />
            </View>
          </View>
        </Animated.View>

        <Animated.Text
          style={[
            styles.appName,
            {
              opacity: caption,
              transform: [{ translateY: captionTranslateY }],
            },
          ]}
        >
          فرحتكم
        </Animated.Text>
        <Animated.Text
          style={[
            styles.tagline,
            {
              opacity: caption,
              transform: [{ translateY: captionTranslateY }],
            },
          ]}
        >
          فرحتكم تبدأ من هنا
        </Animated.Text>

        <Animated.View
          style={[styles.spinner, { transform: [{ rotate: spinDeg }] }]}
        >
          <View style={styles.spinnerArc} />
        </Animated.View>
        <Text style={styles.loadingLabel}>جارٍ التحميل...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7b2cbf",
  },
  layer: { ...StyleSheet.absoluteFillObject },
  center: { alignItems: "center", paddingHorizontal: 24 },
  logoWrap: { marginBottom: 18 },
  logoHalo: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 76, height: 76, borderRadius: 38 },
  appName: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 4,
  },
  tagline: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  spinner: {
    width: 38,
    height: 38,
    marginTop: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  spinnerArc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.18)",
    borderTopColor: "#ffffff",
  },
  loadingLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    marginTop: 12,
    letterSpacing: 0.5,
  },
});
