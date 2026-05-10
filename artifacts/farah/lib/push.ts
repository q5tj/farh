/**
 * Expo Push notifications — registration, deactivation, and tap routing.
 *
 * Tokens are stored in `push_tokens` (one row per device per user). Each
 * device has a single token; rows are deactivated (is_active=false) when the
 * user signs out or disables push, never deleted (preserves audit trail and
 * lets us re-enable instantly).
 *
 * On web every export is a safe no-op — the native modules are NOT imported
 * so the web bundle stays clean.
 */

import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const isNative = Platform.OS === "ios" || Platform.OS === "android";

// Expo Go (the sandbox app from the App Store) dropped remote-push support
// in SDK 53. Even importing `expo-notifications` triggers a fatal crash there
// because the package auto-registers a token listener at import time.
// We must detect the Expo Go runtime and never touch the module from it.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const canUsePush = isNative && !isExpoGo;

export const isPushSupported = canUsePush;

export type PushPermissionStatus = "granted" | "denied" | "undetermined";

// Lazily import the native modules on demand — keeps web bundles clean and
// avoids running module-level side effects on platforms that don't support
// them (web + Expo Go).
async function loadNative() {
  if (!canUsePush) return null;
  const [Notifications, Device] = await Promise.all([
    import("expo-notifications"),
    import("expo-device"),
  ]);
  return { Notifications, Device };
}

let handlerInstalled = false;
let androidChannelEnsured = false;

async function ensureHandler(
  Notifications: typeof import("expo-notifications"),
) {
  if (handlerInstalled) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  handlerInstalled = true;
}

async function ensureAndroidChannel(
  Notifications: typeof import("expo-notifications"),
) {
  if (Platform.OS !== "android" || androidChannelEnsured) return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "الإشعارات",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#7b2cbf",
  });
  androidChannelEnsured = true;
}

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId
  );
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  const native = await loadNative();
  if (!native) return "denied";
  if (!native.Device.isDevice) return "denied";
  const { status } = await native.Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export async function requestPushPermission(): Promise<PushPermissionStatus> {
  const native = await loadNative();
  if (!native) return "denied";
  if (!native.Device.isDevice) return "denied";
  const { status: existing } =
    await native.Notifications.getPermissionsAsync();
  if (existing === "granted") return "granted";
  const { status } = await native.Notifications.requestPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export type RegisterPushResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/**
 * Register the current device for push, save the token to Supabase, and
 * activate it. Returns a discriminated result so callers can surface the
 * failure reason in the UI (instead of swallowing it silently).
 */
export async function registerPushAsync(
  userId: string,
): Promise<RegisterPushResult> {
  const native = await loadNative();
  if (!native) {
    return {
      ok: false,
      reason: isExpoGo
        ? "Push isn't supported in Expo Go (SDK 53+). Use a development build."
        : "Push is only available on iOS/Android devices.",
    };
  }
  if (!native.Device.isDevice) {
    return { ok: false, reason: "Push requires a real device, not a simulator." };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, reason: "Supabase not configured." };
  }

  const { Notifications } = native;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    return { ok: false, reason: `notification permission is "${status}"` };
  }

  await ensureHandler(Notifications);
  await ensureAndroidChannel(Notifications);

  const projectId = getProjectId();
  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = result.data;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.warn("[push] failed to get Expo push token", err);
    return { ok: false, reason: `getExpoPushToken failed: ${msg}` };
  }

  const platform: "ios" | "android" =
    Platform.OS === "ios" ? "ios" : "android";

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      token,
      platform,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" },
  );
  if (error) {
    console.warn("[push] failed to upsert push token", error);
    return { ok: false, reason: `db upsert failed: ${error.message}` };
  }
  return { ok: true, token };
}

/**
 * Mark the current device's token inactive on the server.
 * Use on sign-out or when the user disables push from settings.
 */
export async function deactivatePushAsync(userId: string): Promise<void> {
  const native = await loadNative();
  if (!native) return;
  if (!isSupabaseConfigured || !supabase) return;

  const projectId = getProjectId();
  let token: string | null = null;
  try {
    const result = await native.Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = result.data;
  } catch {
    // permission may have been revoked — best-effort: deactivate all rows
    // for this user instead.
  }
  if (token) {
    await supabase
      .from("push_tokens")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("token", token);
  } else {
    await supabase
      .from("push_tokens")
      .update({ is_active: false })
      .eq("user_id", userId);
  }
}

/**
 * Subscribe to taps on push notifications. The callback receives the data
 * payload from the notification (e.g. `{ booking_id: '...' }`).
 *
 * Also handles the "cold start" case where the app was launched by tapping
 * a notification — the most-recent response is replayed once.
 *
 * Returns a teardown function. On web the listener is a no-op.
 */
export function addPushTapListener(
  onTap: (data: Record<string, unknown>) => void,
): () => void {
  if (!isNative) return () => {};

  let teardown: (() => void) | null = null;
  let cancelled = false;

  loadNative().then((native) => {
    if (cancelled || !native) return;
    const subscription =
      native.Notifications.addNotificationResponseReceivedListener(
        (response) => {
          onTap(response.notification.request.content.data ?? {});
        },
      );
    teardown = () => subscription.remove();

    // Cold start: deliver the launch-tap payload once.
    native.Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        onTap(response.notification.request.content.data ?? {});
      }
    });
  });

  return () => {
    cancelled = true;
    teardown?.();
  };
}
