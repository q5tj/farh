import type { Session } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { deactivatePushAsync, registerPushAsync } from "@/lib/push";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type UserRole = "customer" | "provider" | "admin";
export type Gender = "male" | "female";
export type LangCode = "ar" | "en";
export type ProviderVerificationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_update";

export interface UserProfile {
  id: string;
  authUserId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  gender: Gender | null;
  age: number | null;
  language: LangCode;
  role: UserRole;
  city: string | null;
  providerId: string | null;
  /** Only meaningful when providerId is set. Pending until admin approves. */
  providerVerificationStatus: ProviderVerificationStatus | null;
  /** Optional reason when status === 'rejected'. */
  providerRejectionReason: string | null;
  profileCompleted: boolean;
}

export interface ProfileUpdate {
  fullName?: string;
  phone?: string;
  avatarUrl?: string | null;
  gender?: Gender;
  age?: number;
  language?: LangCode;
}

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  /** Sign in with email + password. Throws on failure. */
  login: (email: string, password: string) => Promise<void>;
  /** Create account with email + password and auto sign-in. Throws on failure. */
  signup: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Update profile fields and persist; sets profile_completed=true when all required fields are present. */
  updateProfile: (patch: ProfileUpdate) => Promise<void>;
  /** Refetch the public.users row for the current session. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function ensureClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "Supabase ليس مهيأً. تحقق من ملف .env (EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY)",
    );
  }
  return supabase;
}

interface UsersRow {
  id: string;
  auth_user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  gender: Gender | null;
  age: number | null;
  language: LangCode | null;
  role: UserRole;
  city: string | null;
  profile_completed: boolean;
}

interface ProviderInfo {
  id: string;
  status: ProviderVerificationStatus | null;
  reason: string | null;
}

function mapRow(row: UsersRow, provider: ProviderInfo | null): UserProfile {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    gender: row.gender,
    age: row.age,
    language: row.language ?? "ar",
    role: row.role,
    city: row.city,
    providerId: provider?.id ?? null,
    providerVerificationStatus: provider?.status ?? null,
    providerRejectionReason: provider?.reason ?? null,
    profileCompleted: row.profile_completed,
  };
}

const PROFILE_COLS =
  "id, auth_user_id, email, full_name, phone, avatar_url, gender, age, language, role, city, profile_completed";

async function fetchProfile(
  authUserId: string,
  fallbackEmail: string | null,
): Promise<UserProfile | null> {
  const client = ensureClient();
  const { data, error } = await client
    .from("users")
    .select(PROFILE_COLS)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;

  let row = data as UsersRow | null;
  // Self-heal: if the DB trigger didn't create the row (or migration_v2 not run),
  // create it from the client. RLS lets the user insert their own row.
  if (!row) {
    const { data: inserted, error: insErr } = await client
      .from("users")
      .insert({
        auth_user_id: authUserId,
        email: fallbackEmail,
        role: "customer",
        language: "ar",
        profile_completed: false,
      })
      .select(PROFILE_COLS)
      .single();
    if (insErr) throw insErr;
    row = inserted as UsersRow;
  }

  const { data: provider } = await client
    .from("providers")
    .select("id, verification_status, verification_rejection_reason")
    .eq("user_id", row.id)
    .maybeSingle();
  const providerInfo: ProviderInfo | null = provider
    ? {
        id: (provider as { id: string }).id,
        status:
          (provider as { verification_status: ProviderVerificationStatus | null })
            .verification_status ?? null,
        reason:
          (provider as { verification_rejection_reason: string | null })
            .verification_rejection_reason ?? null,
      }
    : null;
  return mapRow(row, providerInfo);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadProfile = useCallback(
    async (authUserId: string | null, email: string | null) => {
      if (!authUserId) {
        setProfile(null);
        return;
      }
      try {
        const next = await fetchProfile(authUserId, email);
        if (mountedRef.current) setProfile(next);
      } catch (err) {
        console.warn("[auth] failed to load profile", err);
        if (mountedRef.current) setProfile(null);
      }
    },
    [],
  );

  // Bootstrap + subscribe to auth changes
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;

    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const { data } = await client.auth.getSession();
        const s = data.session ?? null;
        setSession(s);
        await loadProfile(s?.user.id ?? null, s?.user.email ?? null);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
      const sub = client.auth.onAuthStateChange(async (_event, s) => {
        setSession(s);
        await loadProfile(s?.user.id ?? null, s?.user.email ?? null);
      });
      unsub = () => sub.data.subscription.unsubscribe();
    })();

    return () => {
      unsub?.();
    };
  }, [loadProfile]);

  const login = useCallback(async (email: string, password: string) => {
    const client = ensureClient();
    const { error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  }, []);

  const signup = useCallback(
    async (email: string, password: string) => {
      const client = ensureClient();
      const trimmed = email.trim().toLowerCase();
      const { data, error } = await client.auth.signUp({
        email: trimmed,
        password,
      });
      if (error) {
        // Supabase rolls back the user when its SMTP is enabled but failing
        // ("Error sending confirmation email"). The fix is at the project
        // level — disable "Confirm email" in the dashboard. Surface a clear
        // actionable message instead of the raw error.
        const msg = error.message ?? "";
        if (/confirmation email|sending|smtp/i.test(msg)) {
          throw new Error(
            "تأكيد الإيميل مفعّل في Supabase وفشل إرسال الرسالة. " +
              "افتح Supabase Dashboard → Authentication → Providers → Email " +
              "وأوقف خيار \"Confirm email\"، ثم أعد المحاولة.",
          );
        }
        throw error;
      }
      // Supabase returns a session immediately when "Confirm email" is OFF in
      // the dashboard (Auth → Providers → Email). If it's ON, no session is
      // returned and signInWithPassword fails with "Email not confirmed".
      let nextSession = data.session;
      if (!nextSession) {
        const { data: signInData, error: loginErr } =
          await client.auth.signInWithPassword({ email: trimmed, password });
        if (loginErr) {
          throw new Error(
            "تأكيد الإيميل ما زال مفعّلاً في Supabase. " +
              "أوقفه من Authentication → Providers → Email → Confirm email.",
          );
        }
        nextSession = signInData.session;
      }
      // Force-sync context state so the caller (signup screen) can rely on
      // session+profile being populated by the time signup() resolves —
      // without racing onAuthStateChange.
      if (nextSession) {
        if (mountedRef.current) setSession(nextSession);
        await loadProfile(
          nextSession.user.id,
          nextSession.user.email ?? null,
        );
      }
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    // Best-effort: deactivate this device's push token before clearing the
    // session. RLS only allows the authenticated user to update their own
    // tokens, so this must run before signOut() drops the JWT.
    if (profile?.id) {
      await deactivatePushAsync(profile.id).catch(() => {});
    }
    if (!supabase) {
      setSession(null);
      setProfile(null);
      return;
    }
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, [profile?.id]);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) return;
    await loadProfile(session.user.id, session.user.email ?? null);
  }, [loadProfile, session?.user.id, session?.user.email]);

  // Auto-register the current device for push as soon as we have a profile.
  // `registerPushAsync` is a no-op on web/simulators and when permission was
  // not granted — so this is safe to run unconditionally; the OS won't
  // re-prompt the user once they've decided.
  useEffect(() => {
    if (!profile?.id) return;
    registerPushAsync(profile.id).catch((err) => {
      console.warn("[auth] push registration failed", err);
    });
  }, [profile?.id]);

  const updateProfile = useCallback(
    async (patch: ProfileUpdate) => {
      if (!profile) throw new Error("لا يوجد ملف مستخدم لتحديثه");
      const client = ensureClient();

      const next: Partial<UsersRow> = {};
      if (patch.fullName !== undefined) next.full_name = patch.fullName;
      if (patch.phone !== undefined) next.phone = patch.phone;
      if (patch.avatarUrl !== undefined) next.avatar_url = patch.avatarUrl;
      if (patch.gender !== undefined) next.gender = patch.gender;
      if (patch.age !== undefined) next.age = patch.age;
      if (patch.language !== undefined) next.language = patch.language;

      // Note: profile_completed is now computed by a server-side trigger
      // (`update_profile_completed` in migration_v6) — do NOT set from client.
      // Client-set was a security gap allowing the auth gate to be bypassed.

      const { error } = await client
        .from("users")
        .update(next)
        .eq("id", profile.id);
      if (error) throw error;
      await refreshProfile();
    },
    [profile, refreshProfile],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      login,
      signup,
      signOut,
      updateProfile,
      refreshProfile,
    }),
    [
      session,
      profile,
      loading,
      login,
      signup,
      signOut,
      updateProfile,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isPhone(value: string): boolean {
  const cleaned = value.replace(/\D/g, "");
  return cleaned.length >= 9 && cleaned.length <= 14;
}
