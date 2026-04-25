import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type UserRole = "customer" | "provider" | "admin";

export interface AppUser {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
  city?: string;
  providerId?: string;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  signIn: (phone: string) => Promise<void>;
  signOut: () => Promise<void>;
  setRole: (role: UserRole) => Promise<void>;
  updateName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const KEY = "@farah/user";

function deriveRole(phone: string): UserRole {
  const last = phone.slice(-1);
  if (last === "0") return "admin";
  if (last === "1" || last === "2") return "provider";
  return "customer";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setUser(JSON.parse(raw));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (next: AppUser | null) => {
    setUser(next);
    if (next) await AsyncStorage.setItem(KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(KEY);
  }, []);

  const signIn = useCallback(
    async (phone: string) => {
      const role = deriveRole(phone);
      const name =
        role === "admin"
          ? "مالك المشروع"
          : role === "provider"
            ? "مزود الخدمة"
            : "ضيفنا الكريم";
      const next: AppUser = {
        id: `u_${Date.now()}`,
        phone,
        name,
        role,
        city: "الرياض",
        providerId: role === "provider" ? "p1" : undefined,
      };
      await persist(next);
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    await persist(null);
  }, [persist]);

  const setRole = useCallback(
    async (role: UserRole) => {
      if (!user) return;
      const next: AppUser = {
        ...user,
        role,
        providerId: role === "provider" ? user.providerId ?? "p1" : user.providerId,
      };
      await persist(next);
    },
    [persist, user],
  );

  const updateName = useCallback(
    async (name: string) => {
      if (!user) return;
      await persist({ ...user, name });
    },
    [persist, user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, signOut, setRole, updateName }),
    [user, loading, signIn, signOut, setRole, updateName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
