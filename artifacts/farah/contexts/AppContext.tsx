import AsyncStorage from "@react-native-async-storage/async-storage";
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
  fetchProviderByOwner,
  fetchProviders,
  fetchUserBookings,
  fetchUserFavorites,
  markAllNotificationsRead as markAllReadDb,
  toggleFavorite as toggleFavoriteDb,
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
  /** The current user's own provider row — bypasses the customer-facing
   *  filter (which excludes pending/inactive providers), so the provider
   *  always sees their own services/gallery/working-hours regardless of
   *  verification status. Null for non-providers. */
  ownProvider: Provider | null;
  // user data (scoped to current auth user)
  bookings: Booking[]; // bookings the user made AS a customer
  providerBookings: Booking[]; // bookings received AS a provider (only if user has a provider record)
  notifications: AppNotification[];
  favoriteIds: Set<string>; // provider ids the current user has favorited
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
  // favorites
  isFavorite: (providerId: string) => boolean;
  toggleFavorite: (providerId: string) => Promise<void>;
  // admin actions (RLS enforces admin-only)
  addCategory: (input: {
    nameAr: string;
    nameEn: string;
    slug?: string;
  }) => Promise<void>;
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
  const { profile, refreshProfile } = useAuth();
  const lang = profile?.language ?? "ar";
  const userDbId = profile?.id ?? null;
  const providerId = profile?.providerId ?? null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [ownProvider, setOwnProvider] = useState<Provider | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [providerBookings, setProviderBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
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
    const list = await fetchUserBookings(userDbId, lang);
    if (mountedRef.current) setBookings(list);
  }, [userDbId, lang]);

  const loadProviderBookings = useCallback(async () => {
    if (!providerId) {
      setProviderBookings([]);
      return;
    }
    const list = await fetchProviderBookings(providerId, lang);
    if (mountedRef.current) setProviderBookings(list);
  }, [providerId, lang]);

  const loadNotifications = useCallback(async () => {
    if (!userDbId) {
      setNotifications([]);
      return;
    }
    try {
      const list = await fetchNotifications(userDbId);
      // Apply locally-stored read receipts as a last-resort fallback. The
      // RPC `fetch_user_notifications` already returns `effective_read=true`
      // for broadcasts dismissed via `notification_reads`, but if the
      // migration isn't deployed (or the INSERT silently failed under RLS)
      // this keeps the UX promise — a tap on "mark all read" sticks for
      // the next mount instead of bouncing back to unread.
      const localReadKey = `farh.broadcast_read.${userDbId}`;
      const raw = await AsyncStorage.getItem(localReadKey).catch(() => null);
      const localReadIds = new Set<string>(raw ? JSON.parse(raw) : []);
      const merged = list.map((n) =>
        localReadIds.has(n.id) ? { ...n, read: true } : n,
      );
      if (mountedRef.current) setNotifications(merged);
    } catch (err) {
      console.warn("[notifications] load failed", err);
    }
  }, [userDbId]);

  const loadFavorites = useCallback(async () => {
    if (!userDbId) {
      setFavoriteIds(new Set());
      return;
    }
    try {
      const ids = await fetchUserFavorites(userDbId);
      if (mountedRef.current) setFavoriteIds(new Set(ids));
    } catch (err) {
      console.warn("[app] failed to load favorites", err);
    }
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

  const loadOwnProvider = useCallback(async () => {
    if (!userDbId) {
      setOwnProvider(null);
      return;
    }
    try {
      const own = await fetchProviderByOwner(userDbId, lang);
      if (mountedRef.current) setOwnProvider(own);
    } catch (err) {
      console.warn("[app] failed to load own provider", err);
    }
  }, [userDbId, lang]);

  const loadAll = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      await Promise.all([
        loadCatalog(),
        loadOwnProvider(),
        loadBookings(),
        loadProviderBookings(),
        loadNotifications(),
        loadFavorites(),
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
  }, [loadCatalog, loadOwnProvider, loadBookings, loadProviderBookings, loadNotifications, loadFavorites]);

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
        (payload) => {
          loadNotifications().catch(() => {});
          // Verification status flips fan-in via this same channel: when the
          // admin approves/rejects, a notification arrives with
          // data.kind === 'verification_status' — refresh the profile so the
          // provider-zone gate flips to the right screen automatically.
          const next = (payload as { new?: { data?: { kind?: string } } })?.new;
          if (next?.data?.kind === "verification_status") {
            refreshProfile().catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => {});
    };
  }, [userDbId, loadNotifications, refreshProfile]);

  // Catalog (providers/services): refresh when any provider or service changes.
  // Also refresh the current user's ownProvider record (which bypasses the
  // customer-facing approval filter) so newly-added services show up
  // immediately for the provider, even before admin approval.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadCatalog().catch(() => {});
        loadOwnProvider().catch(() => {});
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
  }, [loadCatalog, loadOwnProvider]);

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
    // Persist read receipts locally FIRST so the UI sticks even if the
    // server call fails. Broadcasts especially depend on this when
    // notification_reads isn't writable for the caller.
    const localReadKey = `farh.broadcast_read.${userDbId}`;
    const allIds = notifications.map((n) => n.id);
    try {
      await AsyncStorage.setItem(localReadKey, JSON.stringify(allIds));
    } catch {
      /* AsyncStorage is best-effort */
    }
    // Then call the RPC to update server-side state (so other devices
    // see the same read state). Failures here are non-fatal because the
    // local cache already covers this device.
    try {
      await markAllReadDb(userDbId);
    } catch (e) {
      console.warn("[notifications] markAllRead RPC failed", e);
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [userDbId, notifications]);

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
      // Refresh the customer-facing catalog AND the provider's own record
      // (provider's own view bypasses the approval/active filters).
      await Promise.all([loadCatalog(), loadOwnProvider()]);
    },
    [loadCatalog, loadOwnProvider],
  );

  const removeProviderService = useCallback(
    async (_providerIdArg: string, serviceId: string) => {
      await deleteServiceDb(serviceId);
      await Promise.all([loadCatalog(), loadOwnProvider()]);
    },
    [loadCatalog, loadOwnProvider],
  );

  // ---- Favorites ----
  const isFavorite = useCallback(
    (providerId: string) => favoriteIds.has(providerId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback(
    async (providerId: string) => {
      if (!userDbId) return;
      const currently = favoriteIds.has(providerId);
      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (currently) next.delete(providerId);
        else next.add(providerId);
        return next;
      });
      try {
        await toggleFavoriteDb(userDbId, providerId, !currently);
      } catch (err) {
        // Rollback on failure
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (currently) next.add(providerId);
          else next.delete(providerId);
          return next;
        });
        throw err;
      }
    },
    [userDbId, favoriteIds],
  );

  // ---- Admin actions ----
  const addCategory = useCallback(
    async (input: { nameAr: string; nameEn: string; slug?: string }) => {
      const finalSlug =
        input.slug?.trim() ||
        `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await adminAddCategory({
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        slug: finalSlug,
      });
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
    // Accepts UUID or slug — routes pass whichever was in the URL.
    (idOrSlug: string) =>
      providers.find((p) => p.id === idOrSlug || p.slug === idOrSlug),
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
      ownProvider,
      bookings,
      providerBookings,
      notifications,
      favoriteIds,
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
      isFavorite,
      toggleFavorite,
      getProvider,
      getProviderBySlug,
      getCategoryById,
      getCategoryBySlug,
      getProvidersByCategorySlug,
    }),
    [
      categories,
      providers,
      ownProvider,
      bookings,
      providerBookings,
      notifications,
      favoriteIds,
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
      isFavorite,
      toggleFavorite,
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
