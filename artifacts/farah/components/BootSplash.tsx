import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
} from "react-native";

// React Native Web doesn't ship the native animated module, so any
// `useNativeDriver: true` spams a console warning even though animations
// still run via the JS fallback. Flip the flag off on web to keep dev
// consoles quiet. On iOS/Android we keep the GPU-accelerated path.
const USE_NATIVE_DRIVER = Platform.OS !== "web";

/**
 * App boot screen — shown while AuthContext bootstraps the session.
 *
 * Cairo fonts are guaranteed loaded by the time this renders (see
 * `app/_layout.tsx`, which gates the entire tree on `useFonts`), so we use
 * Cairo_700Bold for the wordmark — same font as everywhere else in the
 * app, no system-font flash on launch.
 *
 * No native modules (LinearGradient / Reanimated) — we layer plain Views
 * for the gradient effect so first-launch on iOS doesn't risk a white
 * screen if a native module is still warming up.
 */
export function BootSplash() {
  // Logo: gentle pulse (scale + alpha) on a 1.6s loop.
  const pulse = useRef(new Animated.Value(0)).current;
  // Caption + halo fade-in.
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    const fadeIn = Animated.timing(fade, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    pulseLoop.start();
    fadeIn.start();
    return () => {
      pulseLoop.stop();
      fadeIn.stop();
    };
  }, [pulse, fade]);

  const logoScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.05],
  });
  const captionTranslateY = fade.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        {/* Animated halo — pulses outward behind the logo */}
        <Animated.View
          style={[
            styles.halo,
            { opacity: haloOpacity, transform: [{ scale: haloScale }] },
          ]}
        />

        <Animated.View
          style={[
            styles.logoWrap,
            { transform: [{ scale: logoScale }] },
          ]}
        >
          <View style={styles.logoCircle}>
            <Image
              source={require("../assets/images/icon.png")}
              style={styles.logo}
            />
          </View>
        </Animated.View>

        <Animated.Text
          style={[
            styles.appName,
            { opacity: fade, transform: [{ translateY: captionTranslateY }] },
          ]}
        >
          فرحتكم
        </Animated.Text>

        {/* Three-dot loader, very subtle — replaces the heavy spinner. */}
        <Animated.View style={[styles.dotsRow, { opacity: fade }]}>
          <Dot delay={0} />
          <Dot delay={150} />
          <Dot delay={300} />
        </Animated.View>
      </View>
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.1] });
  return (
    <Animated.View
      style={[styles.dot, { opacity, transform: [{ scale }] }]}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7b2cbf",
  },
  center: { alignItems: "center", paddingHorizontal: 24 },
  halo: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(255,255,255,0.20)",
    top: -50,
  },
  logoWrap: { marginBottom: 22 },
  logoCircle: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.28)",
  },
  logo: { width: 84, height: 84, borderRadius: 42 },
  appName: {
    color: "#ffffff",
    fontSize: 34,
    fontFamily: "Cairo_700Bold",
    letterSpacing: 0.5,
    marginTop: 4,
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ffffff",
  },
});
