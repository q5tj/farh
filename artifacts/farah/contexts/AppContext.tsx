import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { CATEGORIES, Category } from "@/constants/categories";
import { SEED_PROVIDERS, SeedProvider } from "@/constants/seedData";

export type BookingStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "completed"
  | "cancelled";

export interface Booking {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  providerId: string;
  serviceId: string;
  serviceTitle: string;
  price: number;
  date: string; // ISO date
  time: string;
  location: string;
  notes: string;
  status: BookingStatus;
  createdAt: number;
  rating?: number;
  reviewText?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  bookingId?: string;
}

export interface ProviderService {
  id: string;
  title: string;
  price: number;
  duration: string;
}

interface AppContextValue {
  // catalog
  categories: Category[];
  providers: SeedProvider[];
  // user data
  bookings: Booking[];
  notifications: AppNotification[];
  // settings
  commissionRate: number; // %
  // actions
  addBooking: (
    b: Omit<Booking, "id" | "status" | "createdAt">,
  ) => Promise<Booking>;
  updateBookingStatus: (id: string, status: BookingStatus) => Promise<void>;
  rateBooking: (id: string, rating: number, text: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  pushNotification: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => Promise<void>;
  // catalog mutations
  addCategory: (name: string) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  upsertProviderService: (
    providerId: string,
    service: ProviderService,
  ) => Promise<void>;
  removeProviderService: (providerId: string, serviceId: string) => Promise<void>;
  setCommissionRate: (rate: number) => Promise<void>;
  // helpers
  getProvider: (id: string) => SeedProvider | undefined;
  getCategory: (id: string) => Category | undefined;
  getProvidersByCategory: (catId: string) => SeedProvider[];
}

const AppContext = createContext<AppContextValue | null>(null);
const STORAGE_KEY = "@farah/state";

interface PersistShape {
  bookings: Booking[];
  notifications: AppNotification[];
  categories: Category[];
  providers: SeedProvider[];
  commissionRate: number;
}

const defaultState: PersistShape = {
  bookings: [],
  notifications: [
    {
      id: "n0",
      title: "أهلاً بك في فرح",
      body: "تصفح أفضل مزودي الخدمات لتنظيم مناسبتك المثالية",
      createdAt: Date.now(),
      read: false,
    },
  ],
  categories: CATEGORIES,
  providers: SEED_PROVIDERS,
  commissionRate: 10,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistShape>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PersistShape>;
          setState({
            bookings: parsed.bookings ?? defaultState.bookings,
            notifications: parsed.notifications ?? defaultState.notifications,
            categories: parsed.categories ?? defaultState.categories,
            providers: parsed.providers ?? defaultState.providers,
            commissionRate: parsed.commissionRate ?? defaultState.commissionRate,
          });
        }
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  const addBooking: AppContextValue["addBooking"] = useCallback(async (b) => {
    const booking: Booking = {
      ...b,
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      status: "pending",
      createdAt: Date.now(),
    };
    const notif: AppNotification = {
      id: `n_${Date.now()}`,
      title: "تم إرسال الحجز",
      body: `تم استلام طلبك "${b.serviceTitle}" وهو قيد المراجعة`,
      createdAt: Date.now(),
      read: false,
      bookingId: booking.id,
    };
    setState((prev) => ({
      ...prev,
      bookings: [booking, ...prev.bookings],
      notifications: [notif, ...prev.notifications],
    }));
    return booking;
  }, []);

  const updateBookingStatus: AppContextValue["updateBookingStatus"] =
    useCallback(async (id, status) => {
      setState((prev) => {
        const booking = prev.bookings.find((b) => b.id === id);
        const map: Record<BookingStatus, string> = {
          pending: "بانتظار الرد",
          accepted: "تم قبول حجزك",
          rejected: "تم رفض حجزك",
          completed: "تم إنهاء الخدمة",
          cancelled: "تم إلغاء الحجز",
        };
        const note: AppNotification | null = booking
          ? {
              id: `n_${Date.now()}`,
              title: map[status],
              body: booking.serviceTitle,
              createdAt: Date.now(),
              read: false,
              bookingId: id,
            }
          : null;
        return {
          ...prev,
          bookings: prev.bookings.map((b) =>
            b.id === id ? { ...b, status } : b,
          ),
          notifications: note ? [note, ...prev.notifications] : prev.notifications,
        };
      });
    }, []);

  const rateBooking: AppContextValue["rateBooking"] = useCallback(
    async (id, rating, text) => {
      setState((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) =>
          b.id === id ? { ...b, rating, reviewText: text } : b,
        ),
      }));
    },
    [],
  );

  const markNotificationsRead = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  }, []);

  const pushNotification: AppContextValue["pushNotification"] = useCallback(
    async (n) => {
      const note: AppNotification = {
        ...n,
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
        read: false,
      };
      setState((prev) => ({
        ...prev,
        notifications: [note, ...prev.notifications],
      }));
    },
    [],
  );

  const addCategory = useCallback(async (name: string) => {
    const id = `c_${Date.now()}`;
    const cat: Category = { id, name, icon: "star", color: "#7b2cbf" };
    setState((prev) => ({ ...prev, categories: [...prev.categories, cat] }));
  }, []);

  const removeCategory = useCallback(async (id: string) => {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c.id !== id),
    }));
  }, []);

  const upsertProviderService: AppContextValue["upsertProviderService"] =
    useCallback(async (providerId, service) => {
      setState((prev) => ({
        ...prev,
        providers: prev.providers.map((p) => {
          if (p.id !== providerId) return p;
          const exists = p.services.some((s) => s.id === service.id);
          return {
            ...p,
            services: exists
              ? p.services.map((s) => (s.id === service.id ? service : s))
              : [...p.services, service],
          };
        }),
      }));
    }, []);

  const removeProviderService = useCallback(
    async (providerId: string, serviceId: string) => {
      setState((prev) => ({
        ...prev,
        providers: prev.providers.map((p) =>
          p.id === providerId
            ? { ...p, services: p.services.filter((s) => s.id !== serviceId) }
            : p,
        ),
      }));
    },
    [],
  );

  const setCommissionRate = useCallback(async (rate: number) => {
    setState((prev) => ({ ...prev, commissionRate: rate }));
  }, []);

  const getProvider = useCallback(
    (id: string) => state.providers.find((p) => p.id === id),
    [state.providers],
  );
  const getCategory = useCallback(
    (id: string) => state.categories.find((c) => c.id === id),
    [state.categories],
  );
  const getProvidersByCategory = useCallback(
    (catId: string) => state.providers.filter((p) => p.categoryId === catId),
    [state.providers],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      categories: state.categories,
      providers: state.providers,
      bookings: state.bookings,
      notifications: state.notifications,
      commissionRate: state.commissionRate,
      addBooking,
      updateBookingStatus,
      rateBooking,
      markNotificationsRead,
      pushNotification,
      addCategory,
      removeCategory,
      upsertProviderService,
      removeProviderService,
      setCommissionRate,
      getProvider,
      getCategory,
      getProvidersByCategory,
    }),
    [
      state,
      addBooking,
      updateBookingStatus,
      rateBooking,
      markNotificationsRead,
      pushNotification,
      addCategory,
      removeCategory,
      upsertProviderService,
      removeProviderService,
      setCommissionRate,
      getProvider,
      getCategory,
      getProvidersByCategory,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
