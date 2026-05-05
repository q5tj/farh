import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

declare global {
  // eslint-disable-next-line no-var
  var __farah_supabase__: SupabaseClient | null | undefined;
}

function makeClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      storage: Platform.OS === "web" ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
    },
  });
}

// Cache on globalThis so Fast Refresh / HMR reuses the same client. A new
// client per HMR cycle would race for the navigator.locks lock and surface
// "Lock broken by another request with the 'steal' option" AbortErrors.
export const supabase: SupabaseClient | null = (() => {
  if (Platform.OS === "web") {
    if (globalThis.__farah_supabase__ === undefined) {
      globalThis.__farah_supabase__ = makeClient();
    }
    return globalThis.__farah_supabase__ ?? null;
  }
  return makeClient();
})();
