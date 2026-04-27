/**
 * Network-status subscriber.
 *
 * Web: uses `navigator.onLine` + `online`/`offline` events (instantaneous).
 * Native: polls Supabase every 30s with a HEAD-style request — coarse but
 * reliable without adding NetInfo as a dependency.
 *
 * The callback is fired on every change (de-duped) plus once on subscribe.
 */

import { Platform } from "react-native";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Listener = (online: boolean) => void;

let lastStatus: boolean | null = null;
const listeners = new Set<Listener>();
let pollHandle: ReturnType<typeof setInterval> | null = null;

function notify(next: boolean) {
  if (lastStatus === next) return;
  lastStatus = next;
  listeners.forEach((l) => l(next));
}

async function pingNative(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return true;
  try {
    // Lightweight authed call; works regardless of whether session exists.
    // We don't need data — just whether the round-trip resolved.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const builder = supabase.from("cities").select("id").limit(1) as unknown as {
      abortSignal: (s: AbortSignal) => Promise<unknown>;
    };
    await builder.abortSignal(ctrl.signal);
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

function startPollingIfNeeded() {
  if (Platform.OS === "web") return;
  if (pollHandle !== null) return;
  pollHandle = setInterval(async () => {
    const next = await pingNative();
    notify(next);
  }, 30_000);
}

function stopPollingIfIdle() {
  if (pollHandle !== null && listeners.size === 0) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

export function subscribeToOnlineStatus(cb: Listener): () => void {
  listeners.add(cb);

  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    const onlineNow = navigator.onLine;
    if (lastStatus === null) {
      lastStatus = onlineNow;
    }
    cb(onlineNow);
    const handle = () => notify(navigator.onLine);
    window.addEventListener("online", handle);
    window.addEventListener("offline", handle);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("online", handle);
      window.removeEventListener("offline", handle);
    };
  }

  // Native
  if (lastStatus === null) {
    cb(true);
    pingNative().then(notify);
  } else {
    cb(lastStatus);
  }
  startPollingIfNeeded();
  return () => {
    listeners.delete(cb);
    stopPollingIfIdle();
  };
}
