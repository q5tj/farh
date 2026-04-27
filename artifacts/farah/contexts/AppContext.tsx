import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  adminAddCategory,
  adminBroadcastNotification,
  adminRemoveCategory,
  adminSetCommissionRate,
  AppNotification,
  Booking,
  BookingStatus,
  Category,
  Provider,
  ProviderService,
  createBooking as createBookingDb,
  createReview as createReviewDb,
  deleteService as deleteServiceDb,
  fetchCategories,
  fetchCommissionRate,
  fetchNotifications,
  fetchProviderBookings,
  fetchProviderById,
  fetchProviders,
  fetchUserBookings,
  markAllNotificationsRead as markAllReadDb,
  updateBookingStatus as updateBookingStatusDb,
  upsertService as upsertServiceDb,
} from "@/lib/data";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

// Re-export so existing screens that import these names from AppContext keep working.
export type { AppNotification, Booking, BookingStatus, Category, Provider, ProviderService };

interface AppContextValue {
  // catalog (read-only, from DB)
  categories: Category[];
  providers: Provider[];
  // user data (scoped to current auth user)
  bookings: Booking[]; // bookings the user made AS a customer
  providerBookings: Booking[]; // bookings received AS a provider (only if user has a provider record)
  notifications: AppNotification[];
  // settings
  commissionRate: number;
  // load state
  loading: boolean;
  refreshing: boolean;
  // actions
  refresh: () => Promise<void>;
  addBooking: (input: AddBookingInput) => Promise<Booking>;
  updateBookingStatus: (id: string, status: BookingStatus) => Promise<void>;
  rateBooking: (id: string, rating: number, text: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  upsertProviderService: (
    providerId: string,
    service: {
      id?: string;
      titleAr: string;
      titleEn: string;
      descriptionAr?: string;
      descriptionEn?: string;
      price: number;
      duration: string;
      durationMinutes: number;
    },
  ) => Promise<void>;
  removeProviderService: (providerId: string, serviceId: string) => Promise<void>;
  // admin actions (RLS enforces admin-only)
  addCategory: (name: string, slug?: string) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  setCommissionRate: (rate: number) => Promise<void>;
  pushNotification: (input: { title: string; body: string }) => Promise<void>;
  // helpers
  getProvider: (id: string) => Provider | undefined;
  getProviderBySlug: (slug: string) => Provider | undefined;
  getCategoryById: (id: string) => Category | undefined;
  getCategoryBySlug: (slug: string) => Category | undefined;
  getProvidersByCategorySlug: (slug: string) => Provider[];
}

interface AddBookingInput {
  providerId: string;
  serviceId: string;
  serviceTitle: string;
  price: number;
  startAt: Date;
  endAt: Date;
  city: string;
  address: string; // map url
  notes: string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";
  const userDbId = profile?.id ?? null;
  const providerId = profile?.providerId ?? null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [providerBookings, setProviderBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [commissionRate, setCommissionRateState] = useState<number>(10);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ----------------------------------------------------------
  // Loaders
  // ----------------------------------------------------------
  const loadBookings = useCallback(async () => {
    if (!userDbId) {
      setBookings([]);
      return;
    }
    const list = await fetchUserBookings(userDbId);
    if (mountedRef.current) setBookings(list);
  }, [userDbId]);

  const loadProviderBookings = useCallback(async () => {
    if (!providerId) {
      setProviderBookings([]);
      return;
    }
    const list = await fetchProviderBookings(providerId);
    if (mountedRef.current) setProviderBookings(list);
  }, [providerId]);

  const loadNotifications = useCallback(async () => {
    if (!userDbId) {
      setNotifications([]);
      return;
    }
    const list = await fetchNotifications(userDbId);
    if (mountedRef.current) setNotifications(list);
  }, [userDbId]);

  const loadCatalog = useCallback(async () => {
    const [cats, provs] = await Promise.all([
      fetchCategories(lang),
      fetchProviders(lang),
    ]);
    if (!mountedRef.current) return;
    setCategories(cats);
    setProviders(provs);
  }, [lang]);

  const loadAll = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      await Promise.all([
        loadCatalog(),
        loadBookings(),
        loadProviderBookings(),
        loadNotifications(),
        fetchCommissionRate()
          .then((rate) => {
            if (mountedRef.current) setCommissionRateState(rate);
          })
          .catch(() => {}),
      ]);
    } catch (err) {
      console.warn("[app] initial load failed", err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [loadCatalog, loadBookings, loadProviderBookings, loadNotifications]);

  // initial load + reload when language or profile-scope changes
  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [loadAll]);

  // ----------------------------------------------------------
  // Realtime subscriptions
  // ----------------------------------------------------------
  // Bookings as customer
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !userDbId) return;
    const client = supabase;
    const channel = client
      .channel(`bookings_user_${userDbId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `user_id=eq.${userDbId}`,
        },
        () => {
          loadBookings().catch(() => {});
        },
      )
      .subscribe();
    return () => {
      client.removeChannel(channel).catch(() => {});
    };
  }, [userDbId, loadBookings]);

  // Bookings as provider
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !providerId) return;
    const client = supabase;
    const channel = client
      .channel(`bookings_provider_${providerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          loadProviderBookings().catch(() => {});
        },
      )
      .subscribe();
    return () => {
      client.removeChannel(channel).catch(() => {});
    };
  }, [providerId, loadProviderBookings]);

  // Notifications: scoped to user.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !userDbId) return;
    const client = supabase;

    const channel = client
      .channel(`notifications_${userDbId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userDbId}`,
        },
        () => {
          loadNotifications().catch(() => {});
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => {});
    };
  }, [userDbId, loadNotifications]);

  // Catalog (providers/services): refresh when any provider or service changes.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadCatalog().catch(() => {});
      }, 400);
    };

    const channel = client
      .channel("catalog")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "providers" },
        debounced,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services" },
        debounced,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      client.removeChannel(channel).catch(() => {});
    };
  }, [loadCatalog]);

  // ----------------------------------------------------------
  // Mutations
  // ----------------------------------------------------------
  const addBooking = useCallback(
    async (input: AddBookingInput) => {
      if (!userDbId) throw new Error("لم يتم العثور على حسابك");
      const booking = await createBookingDb({
        userId: userDbId,
        providerId: input.providerId,
        serviceId: input.serviceId,
        serviceTitle: input.serviceTitle,
        price: input.price,
        startAt: input.startAt,
        endAt: input.endAt,
        city: input.city,
        address: input.address,
        notes: input.notes,
      });
      // Optimistic add — Realtime will reconcile shortly.
      setBookings((prev) =>
        prev.some((b) => b.id === booking.id) ? prev : [booking, ...prev],
      );
      return booking;
    },
    [userDbId],
  );

  const updateBookingStatus = useCallback(
    async (id: string, status: BookingStatus) => {
      await updateBookingStatusDb(id, status);
      // Optimistic update — Realtime will reconcile.
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status } : b)),
      );
      setProviderBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status } : b)),
      );
    },
    [],
  );

  const rateBooking = useCallback(
    async (id: string, rating: number, text: string) => {
      const booking =
        bookings.find((b) => b.id === id) ??
        providerBookings.find((b) => b.id === id);
      if (!booking || !userDbId) return;
      await createReviewDb({
        bookingId: id,
        userId: userDbId,
        providerId: booking.providerId,
        rating,
        comment: text,
      });
      // Optimistic local update
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, rating, reviewText: text } : b,
        ),
      );
      // Provider rating_avg/rating_count refresh via DB trigger; refetch catalog soon.
      loadCatalog().catch(() => {});
    },
    [bookings, providerBookings, userDbId, loadCatalog],
  );

  const markNotificationsRead = useCallback(async () => {
    if (!userDbId) return;
    await markAllReadDb(userDbId);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [userDbId]);

  const upsertProviderService = useCallback(
    async (
      providerIdArg: string,
      service: {
        id?: string;
        titleAr: string;
        titleEn: string;
        descriptionAr?: string;
        descriptionEn?: string;
        price: number;
        duration: string;
        durationMinutes: number;
      },
    ) => {
      await upsertServiceDb({
        id: service.id,
        providerId: providerIdArg,
        titleAr: service.titleAr,
        titleEn: service.titleEn,
        descriptionAr: service.descriptionAr,
        descriptionEn: service.descriptionEn,
        price: service.price,
        duration: service.duration,
        durationMinutes: service.durationMinutes,
      });
      // Realtime on `services` will refresh the catalog.
      await loadCatalog();
    },
    [loadCatalog],
  );

  const removeProviderService = useCallback(
    async (_providerIdArg: string, serviceId: string) => {
      await deleteServiceDb(serviceId);
      await loadCatalog();
    },
    [loadCatalog],
  );

  // ---- Admin actions ----
  const addCategory = useCallback(
    async (name: string, slug?: string) => {
      const finalSlug =
        slug?.trim() ||
        `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await adminAddCategory({ name, slug: finalSlug });
      await loadCatalog();
    },
    [loadCatalog],
  );

  const removeCategory = useCallback(
    async (id: string) => {
      await adminRemoveCategory(id);
      await loadCatalog();
    },
    [loadCatalog],
  );

  const setCommissionRate = useCallback(async (rate: number) => {
    await adminSetCommissionRate(rate);
    setCommissionRateState(rate);
  }, []);

  const pushNotification = useCallback(
    async (input: { title: string; body: string }) => {
      await adminBroadcastNotification(input);
      // Realtime will pick the new row up; nothing else to do.
    },
    [],
  );

  // ----------------------------------------------------------
  // Helpers / selectors
  // ----------------------------------------------------------
  const getProvider = useCallback(
    (id: string) => providers.find((p) => p.id === id),
    [providers],
  );
  const getProviderBySlug = useCallback(
    (slug: string) =>
      providers.find((p) => p.categorySlug === slug),
    [providers],
  );
  const getCategoryById = useCallback(
    (id: string) => categories.find((cat) => cat.id === id),
    [categories],
  );
  const getCategoryBySlug = useCallback(
    (slug: string) => categories.find((cat) => cat.slug === slug),
    [categories],
  );
  const getProvidersByCategorySlug = useCallback(
    (slug: string) => providers.filter((p) => p.categorySlug === slug),
    [providers],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      categories,
      providers,
      bookings,
      providerBookings,
      notifications,
      commissionRate,
      loading,
      refreshing,
      refresh,
      addBooking,
      updateBookingStatus,
      rateBooking,
      markNotificationsRead,
      upsertProviderService,
      removeProviderService,
      addCategory,
      removeCategory,
      setCommissionRate,
      pushNotification,
      getProvider,
      getProviderBySlug,
      getCategoryById,
      getCategoryBySlug,
      getProvidersByCategorySlug,
    }),
    [
      categories,
      providers,
      bookings,
      providerBookings,
      notifications,
      commissionRate,
      loading,
      refreshing,
      refresh,
      addBooking,
      updateBookingStatus,
      rateBooking,
      markNotificationsRead,
      upsertProviderService,
      removeProviderService,
      addCategory,
      removeCategory,
      setCommissionRate,
      pushNotification,
      getProvider,
      getProviderBySlug,
      getCategoryById,
      getCategoryBySlug,
      getProvidersByCategorySlug,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// Lazy fetch helper used by booking detail screen.
export { fetchProviderById };
