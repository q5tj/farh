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
  identifier: string; // email or phone
  identifierType: "email" | "phone";
  email?: string;
  phone?: string;
  name: string;
  role: UserRole;
  city?: string;
  providerId?: string;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  signIn: (identifier: string) => Promise<void>;
  signOut: () => Promise<void>;
  setRole: (role: UserRole) => Promise<void>;
  updateName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const KEY = "@farah/user";

// Predefined role mapping by email (owner-set accounts)
const ROLE_BY_EMAIL: Record<string, { role: UserRole; name: string; providerId?: string }> = {
  "r3567089@gmail.com": { role: "admin", name: "مالك المشروع" },
  "rateb@lazywait.com": { role: "provider", name: "راتب — مزود الخدمة", providerId: "p1" },
  "developmentservices.sa@gmail.com": { role: "customer", name: "ضيفنا الكريم" },
};

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isPhone(value: string): boolean {
  const cleaned = value.replace(/\D/g, "");
  return cleaned.length >= 9 && cleaned.length <= 14;
}

function deriveFromIdentifier(raw: string): {
  identifier: string;
  identifierType: "email" | "phone";
  role: UserRole;
  name: string;
  email?: string;
  phone?: string;
  providerId?: string;
} {
  const trimmed = raw.trim();
  if (isEmail(trimmed)) {
    const lower = trimmed.toLowerCase();
    const mapping = ROLE_BY_EMAIL[lower];
    if (mapping) {
      return {
        identifier: lower,
        identifierType: "email",
        email: lower,
        role: mapping.role,
        name: mapping.name,
        providerId: mapping.providerId,
      };
    }
    return {
      identifier: lower,
      identifierType: "email",
      email: lower,
      role: "customer",
      name: "ضيفنا الكريم",
    };
  }
  // phone: keep last-digit demo rule for unknown phones
  const cleaned = trimmed.replace(/\D/g, "");
  const last = cleaned.slice(-1);
  let role: UserRole = "customer";
  let name = "ضيفنا الكريم";
  let providerId: string | undefined;
  if (last === "0") {
    role = "admin";
    name = "مالك المشروع";
  } else if (last === "1" || last === "2") {
    role = "provider";
    name = "مزود الخدمة";
    providerId = "p1";
  }
  return {
    identifier: cleaned,
    identifierType: "phone",
    phone: cleaned,
    role,
    name,
    providerId,
  };
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
    async (identifier: string) => {
      const derived = deriveFromIdentifier(identifier);
      const next: AppUser = {
        id: `u_${Date.now()}`,
        identifier: derived.identifier,
        identifierType: derived.identifierType,
        email: derived.email,
        phone: derived.phone,
        name: derived.name,
        role: derived.role,
        city: "الرياض",
        providerId: derived.providerId,
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
