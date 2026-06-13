import {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  useFonts,
} from "@expo-google-fonts/cairo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Platform, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BootSplash } from "@/components/BootSplash";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConfirmHost } from "@/components/ConfirmHost";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppProvider } from "@/contexts/AppContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { applyDirection, setAppLanguage } from "@/lib/i18n";
import { addPushTapListener } from "@/lib/push";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Sets the "underlying" route for modal screens on cold start. Without
// this, a hard refresh on /booking-form (modal, no parent in history)
// makes Expo Router on web pick a fallback screen by directory order —
// which lands on /about (the first non-grouped route alphabetically).
// Anchoring the initial route to the tab bar means modals always have
// the home tab behind them, and direct URL refreshes return the user to
// the exact route they typed.
export const unstable_settings = {
  initialRouteName: "(tabs)",
};

// Apply default direction (AR) on first load. Will be re-applied below
// once the user's profile language is known.
applyDirection("ar");

function AuthGate() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [appliedLang, setAppliedLang] = useState<string | null>(null);

  // a11y: blur the focused element on every route change. React Native
  // Web's Stack navigator slaps `aria-hidden="true"` on the previous
  // screen container, but the button the user just tapped is still
  // focused inside it — Chrome warns "Blocked aria-hidden on an
  // element because its descendant retained focus". Moving focus to
  // <body> first sidesteps the conflict. Web-only no-op everywhere else.
  useEffect(() => {
    if (typeof document !== "undefined") {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) active.blur?.();
    }
  }, [segments]);
  // Hold the BootSplash on screen briefly even after `loading` flips so the
  // animation doesn't pop out abruptly. 350ms is just long enough for the
  // logo pulse to complete a half cycle, then we cross-fade to the app.
  // Hard cap at 5s as a safety net: if AuthContext.loading never resolves
  // (e.g. supabase.auth.getSession() hangs on a flaky network), we still
  // unblock the UI instead of leaving the user stuck on the splash.
  const [bootDone, setBootDone] = useState(false);
  useEffect(() => {
    const tHard = setTimeout(() => setBootDone(true), 5000);
    if (loading) return () => clearTimeout(tHard);
    const tSoft = setTimeout(() => setBootDone(true), 350);
    return () => {
      clearTimeout(tHard);
      clearTimeout(tSoft);
    };
  }, [loading]);

  // Push tap → deep link to the relevant screen.
  useEffect(() => {
    const unsubscribe = addPushTapListener((data) => {
      const bookingId =
        typeof data?.booking_id === "string" ? data.booking_id : null;
      if (bookingId) {
        router.push(`/booking/${bookingId}`);
      }
    });
    return unsubscribe;
  }, [router]);

  // Sync i18n + RTL with profile.language whenever it changes.
  useEffect(() => {
    const target = profile?.language ?? "ar";
    if (appliedLang === target) return;
    setAppLanguage(target).then(() => setAppliedLang(target));
  }, [profile?.language, appliedLang]);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    const onProfileSetup =
      segments[0] === "(auth)" && segments[1] === "profile-setup";
    // Public routes that don't require a session — terms, privacy, etc.
    // /legal/* and /payment/return are reachable without an auth gate —
    // the latter handles the Moyasar redirect even if the session isn't
    // restored yet on cold start.
    const firstSegment = segments[0] as string | undefined;
    const isPublic = firstSegment === "legal" || firstSegment === "payment";

    if (!session) {
      if (!inAuth && !isPublic) router.replace("/(auth)/login");
      return;
    }
    if (!profile) return;
    if (!profile.profileCompleted) {
      if (!onProfileSetup && !isPublic) router.replace("/(auth)/profile-setup");
      return;
    }
    // Profile is complete: bounce out of (auth) UNLESS user opened
    // profile-setup explicitly to edit their data.
    if (inAuth && !onProfileSetup) router.replace("/(tabs)");
  }, [session, profile, loading, segments, router]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="category/[id]" />
        <Stack.Screen name="provider/[id]" />
        {/*
          Modal presentation is native-only. On web a "modal" route has no
          underlying parent on a cold refresh, and Expo Router falls back to
          the first non-grouped screen alphabetically (which lands on /about).
          Using the default presentation on web makes refresh deterministic.
        */}
        <Stack.Screen
          name="booking-form"
          options={Platform.OS === "web" ? undefined : { presentation: "modal" }}
        />
        <Stack.Screen name="booking/[id]" />
        <Stack.Screen name="reschedule/[id]" />
        <Stack.Screen
          name="rate/[id]"
          options={Platform.OS === "web" ? undefined : { presentation: "modal" }}
        />
        <Stack.Screen name="provider-zone" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="support" />
        <Stack.Screen name="about" />
        <Stack.Screen name="favorites" />
        <Stack.Screen name="legal/[key]" />
        <Stack.Screen name="legal/delete-account" />
        <Stack.Screen name="payment/return" />
      </Stack>
      {!bootDone ? <BootSplash /> : null}
    </>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  // Force `direction: 'ltr'` at the root on every platform.
  //
  // Why: the app expresses RTL layout manually via
  // `flexDirection: 'row-reverse'` and `textAlign: 'right'`. If the
  // platform's layout direction is RTL (Android with forceRTL applied,
  // or web with `document.dir='rtl'`), the engine *auto-flips* logical
  // flex directions — turning every `row-reverse` back into `row` and
  // mirroring the entire UI. iOS (where forceRTL didn't take effect)
  // looked right but Android/Web were the inverse.
  //
  // Pinning the root to LTR disables that auto-flip. Arabic glyphs still
  // render right-to-left because Unicode bidi is independent of the
  // CSS/Yoga `direction` property.
  return (
    <GestureHandlerRootView style={{ flex: 1, direction: "ltr" }}>
      {children}
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
  });

  // Watchdog: if Cairo fonts take > 4s to download (slow / blocked
  // network — common for first-launch on cellular), proceed anyway. The
  // app falls back to the system font for that session, which is far
  // better than a permanent white screen with the native splash stuck.
  // Without this, iOS first-launch on a flaky network hangs forever.
  const [fontsTimedOut, setFontsTimedOut] = useState(false);
  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const t = setTimeout(() => setFontsTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError]);

  const ready = fontsLoaded || fontError || fontsTimedOut;

  useEffect(() => {
    if (ready) {
      // Hide the OS-level splash so our React-driven BootSplash takes over.
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  // While we're waiting for fonts (and not yet timed out), render nothing
  // so the OS splash stays up. Showing a JS splash here is risky on iOS
  // first-launch — the LinearGradient / Reanimated init can flake before
  // native modules are warm, leading to a white screen.
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RootShell>
            <KeyboardProvider>
              <AuthProvider>
                <AppProvider>
                  <StatusBar barStyle="dark-content" />
                  <AuthGate />
                  <OfflineBanner />
                  <ConfirmHost />
                </AppProvider>
              </AuthProvider>
            </KeyboardProvider>
          </RootShell>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
