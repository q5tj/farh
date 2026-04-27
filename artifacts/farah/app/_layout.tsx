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

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppProvider } from "@/contexts/AppContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { applyDirection, setAppLanguage } from "@/lib/i18n";
import { addPushTapListener } from "@/lib/push";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Apply default direction (AR) on first load. Will be re-applied below
// once the user's profile language is known.
applyDirection("ar");

function AuthGate() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [appliedLang, setAppliedLang] = useState<string | null>(null);

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

    if (!session) {
      if (!inAuth) router.replace("/(auth)/login");
      return;
    }
    if (!profile) return;
    if (!profile.profileCompleted) {
      if (!onProfileSetup) router.replace("/(auth)/profile-setup");
      return;
    }
    // Profile is complete: bounce out of (auth) UNLESS user opened
    // profile-setup explicitly to edit their data.
    if (inAuth && !onProfileSetup) router.replace("/(tabs)");
  }, [session, profile, loading, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="category/[id]" />
      <Stack.Screen name="provider/[id]" />
      <Stack.Screen name="booking-form" options={{ presentation: "modal" }} />
      <Stack.Screen name="booking/[id]" />
      <Stack.Screen name="rate/[id]" options={{ presentation: "modal" }} />
      <Stack.Screen name="provider-zone" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="support" />
      <Stack.Screen name="about" />
      <Stack.Screen name="favorites" />
    </Stack>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  // We rely on document.dir (web) or I18nManager (native) for direction.
  // The wrapper uses { direction: "inherit" } on web so it picks up the
  // current document direction, and a no-op on native.
  const style = Platform.OS === "web"
    ? { flex: 1, direction: "inherit" as const }
    : { flex: 1 };
  return <GestureHandlerRootView style={style}>{children}</GestureHandlerRootView>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

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
                </AppProvider>
              </AuthProvider>
            </KeyboardProvider>
          </RootShell>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
