/**
 * طبقة الوصول إلى البيانات — كل استدعاءات Supabase الخاصة بالكاتالوج
 * (التصنيفات، المزودون، الخدمات) والحجوزات والإشعارات والتقييمات.
 *
 * الهدف: كل الـ UI يستهلك UI-types (camelCase) ولا يلمس DB rows مباشرة.
 */

import { CategoryIcon } from "@/constants/categories";
import { formatLocalDate, formatTime, formatTimeRange } from "@/lib/format";
import { buildLocation, parseLocation } from "@/lib/location";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/timeouts";

import type { AppLang } from "@/lib/i18n";

// Re-export for screens that imported these from data.ts historically
export { formatTime, formatTimeRange } from "@/lib/format";

// ============================================================
// Types — DB rows
// ============================================================

interface CategoryRow {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  slug: string;
  icon: string | null;
  color: string | null;
  sort_order: number | null;
  is_active: boolean | null;
}

interface ProviderRow {
  id: string;
  user_id: string | null;
  category_id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  cover_url: string | null;
  logo_url: string | null;
  commercial_registration_path: string | null;
  tax_number_path: string | null;
  national_address_path: string | null;
  commission_rate_snapshot: number | string | null;
  verification_rejection_reason: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  is_active: boolean | null;
  verification_status: VerificationStatus | null;
  working_hours: WorkingHoursRow | null;
  category?: { slug: string } | null;
  provider_images?: { url: string; sort_order: number | null }[] | null;
  services?: ServiceRow[] | null;
}

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export type WorkingHours = Record<Weekday, [string, string] | null>;

type WorkingHoursRow = Partial<Record<Weekday, [string, string] | null>>;

interface ServiceRow {
  id: string;
  provider_id: string;
  title: string;
  title_ar: string | null;
  title_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  price: number | string;
  duration: string | null;
  duration_minutes: number | null;
  is_active: boolean | null;
  images: string[] | null;
}

interface BookingRow {
  id: string;
  user_id: string;
  provider_id: string;
  service_id: string;
  service_title: string;
  price: number | string;
  start_at: string;
  end_at: string;
  city: string | null;
  address: string | null;
  notes: string | null;
  status: BookingStatus;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_id: string | null;
  commission_rate: number | string | null;
  created_at: string;
  user?: { full_name: string | null; phone: string | null; email: string | null } | null;
  reviews?: ReviewRow[] | null;
}

interface ReviewRow {
  id: string;
  booking_id: string;
  user_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

interface NotificationRow {
  id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  booking_id: string | null;
  is_read: boolean | null;
  created_at: string;
}

// ============================================================
// Types — UI-facing (camelCase)
// ============================================================

export type BookingStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "completed"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "refunded" | "failed";

export type VerificationStatus = "pending" | "approved" | "rejected";

export interface Category {
  id: string; // UUID
  slug: string; // 'halls', 'photo' …
  name: string; // localized
  nameAr: string;
  nameEn: string;
  icon: CategoryIcon;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ProviderService {
  id: string;
  providerId: string;
  title: string; // localized
  titleAr: string;
  titleEn: string | null;
  price: number;
  duration: string;
  durationMinutes: number;
}

export interface Provider {
  id: string;
  userId: string | null;
  categoryId: string;
  categorySlug: string; // for COVER_BY_CATEGORY fallback
  name: string; // localized
  nameAr: string;
  nameEn: string | null;
  description: string; // localized
  city: string;
  phone: string;
  email: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  commercialRegistrationPath: string | null;
  taxNumberPath: string | null;
  nationalAddressPath: string | null;
  commissionRateSnapshot: number | null;
  verificationRejectionReason: string | null;
  rating: number;
  reviews: number;
  priceFrom: number;
  isActive: boolean;
  verificationStatus: VerificationStatus;
  gallery: string[];
  services: ProviderService[];
  workingHours: WorkingHours;
}

export interface Booking {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  providerId: string;
  serviceId: string;
  serviceTitle: string;
  price: number;
  startAt: string; // ISO timestamp
  endAt: string; // ISO timestamp
  date: string; // derived: YYYY-MM-DD (local) — for backward-compatible UI
  time: string; // derived: localized time range, e.g. "ظهراً 02:00 – عصراً 04:00"
  location: string; // "city|mapUrl" composed via lib/location
  notes: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  createdAt: number; // ms
  rating: number | null;
  reviewText: string | null;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  bookingId?: string;
}

// ============================================================
// Mappers
// ============================================================

function pickLocalized(
  ar: string | null | undefined,
  en: string | null | undefined,
  fallback: string,
  lang: AppLang,
): string {
  if (lang === "en") return en?.trim() || ar?.trim() || fallback;
  return ar?.trim() || en?.trim() || fallback;
}

function mapCategory(row: CategoryRow, lang: AppLang): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: pickLocalized(row.name_ar, row.name_en, row.name, lang),
    nameAr: row.name_ar ?? row.name,
    nameEn: row.name_en ?? row.name,
    icon: ((row.icon as CategoryIcon) || "star") as CategoryIcon,
    color: row.color ?? "#7b2cbf",
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active ?? true,
  };
}

function mapService(row: ServiceRow, lang: AppLang): ProviderService {
  return {
    id: row.id,
    providerId: row.provider_id,
    title: pickLocalized(row.title_ar, row.title_en, row.title, lang),
    titleAr: row.title_ar ?? row.title,
    titleEn: row.title_en,
    price: Number(row.price),
    duration: row.duration ?? "",
    durationMinutes: Number(row.duration_minutes ?? 60),
  };
}

function mapWorkingHours(raw: WorkingHoursRow | null): WorkingHours {
  const empty = { sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null } as WorkingHours;
  if (!raw) return empty;
  const out = { ...empty };
  for (const day of ["sun","mon","tue","wed","thu","fri","sat"] as Weekday[]) {
    const v = raw[day];
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string") {
      out[day] = [v[0], v[1]];
    }
  }
  return out;
}

function mapProvider(row: ProviderRow, lang: AppLang): Provider {
  const services = (row.services ?? []).map((s) => mapService(s, lang));
  const prices = services.map((s) => s.price).filter((p) => p > 0);
  const priceFrom = prices.length ? Math.min(...prices) : 0;

  const gallery = (row.provider_images ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((g) => g.url);

  return {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    categorySlug: row.category?.slug ?? "",
    name: pickLocalized(row.name_ar, row.name_en, row.name, lang),
    nameAr: row.name_ar ?? row.name,
    nameEn: row.name_en,
    description: pickLocalized(
      row.description_ar,
      row.description_en,
      row.description ?? "",
      lang,
    ),
    city: row.city ?? "",
    phone: row.phone ?? "",
    email: row.email,
    coverUrl: row.cover_url,
    logoUrl: row.logo_url,
    commercialRegistrationPath: row.commercial_registration_path,
    taxNumberPath: row.tax_number_path,
    nationalAddressPath: row.national_address_path,
    commissionRateSnapshot:
      row.commission_rate_snapshot != null
        ? Number(row.commission_rate_snapshot)
        : null,
    verificationRejectionReason: row.verification_rejection_reason,
    rating: Number(row.rating_avg ?? 0),
    reviews: Number(row.rating_count ?? 0),
    priceFrom,
    isActive: row.is_active ?? true,
    verificationStatus: row.verification_status ?? "pending",
    gallery,
    services,
    workingHours: mapWorkingHours(row.working_hours),
  };
}

function mapBooking(row: BookingRow, lang: AppLang): Booking {
  const review = (row.reviews ?? [])[0];
  const start = new Date(row.start_at);
  const end = new Date(row.end_at);
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user?.full_name?.trim() || row.user?.email || "—",
    userPhone: row.user?.phone ?? row.user?.email ?? "",
    providerId: row.provider_id,
    serviceId: row.service_id,
    serviceTitle: row.service_title,
    price: Number(row.price),
    startAt: row.start_at,
    endAt: row.end_at,
    date: formatLocalDate(start),
    time: formatTimeRange(start, end, lang),
    location: composeLocation(row.city, row.address),
    notes: row.notes ?? "",
    status: row.status,
    paymentStatus: row.payment_status ?? "pending",
    paymentMethod: row.payment_method ?? null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    rating: review?.rating ?? null,
    reviewText: review?.comment ?? null,
  };
}

// Back-compat shim — slot generator still calls formatTimeAr.
export function formatTimeAr(d: Date): string {
  return formatTime(d, "ar");
}

const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function weekdayKey(d: Date): Weekday {
  return WEEKDAYS[d.getDay()];
}

export interface AvailableSlot {
  start: Date;
  end: Date;
  label: string; // localized "صباحاً 09:00"
}

/** Generate available booking slots for a given date.
 *  - Steps every `intervalMinutes` (default 30).
 *  - Each slot is `durationMinutes` long.
 *  - Filters out slots overlapping any busy interval.
 *  - Filters out slots in the past (for today).
 *  - Slot labels are localized via `lang`.
 */
export function generateSlots(input: {
  date: Date;
  workingHours: [string, string] | null;
  durationMinutes: number;
  intervalMinutes?: number;
  busy: { start: Date; end: Date }[];
  lang?: AppLang;
}): AvailableSlot[] {
  const { date, workingHours, durationMinutes, busy } = input;
  const interval = input.intervalMinutes ?? 30;
  const lang = input.lang ?? "ar";
  if (!workingHours) return [];

  const [openStr, closeStr] = workingHours;
  const [oh, om] = openStr.split(":").map(Number);
  const [ch, cm] = closeStr.split(":").map(Number);

  const dayStart = new Date(date);
  dayStart.setHours(oh, om, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(ch, cm, 0, 0);

  const lastSlotStart = new Date(dayEnd.getTime() - durationMinutes * 60_000);
  const now = new Date();

  const slots: AvailableSlot[] = [];
  for (
    let t = new Date(dayStart);
    t.getTime() <= lastSlotStart.getTime();
    t = new Date(t.getTime() + interval * 60_000)
  ) {
    const slotEnd = new Date(t.getTime() + durationMinutes * 60_000);
    if (t.getTime() < now.getTime()) continue;
    const overlaps = busy.some(
      (b) => t.getTime() < b.end.getTime() && slotEnd.getTime() > b.start.getTime(),
    );
    if (overlaps) continue;
    slots.push({
      start: new Date(t),
      end: slotEnd,
      label: formatTime(t, lang),
    });
  }
  return slots;
}

function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? "",
    createdAt: row.created_at
      ? new Date(row.created_at).getTime()
      : Date.now(),
    read: row.is_read ?? false,
    bookingId: row.booking_id ?? undefined,
  };
}

// ============================================================
// Location encoding — booking.location ⇄ city + address (map url)
// ============================================================
function composeLocation(
  city: string | null,
  address: string | null,
): string {
  const c = (city ?? "").trim();
  const a = (address ?? "").trim();
  if (!a && !c) return "";
  return buildLocation(c, a || undefined);
}

export function decomposeLocation(value: string): {
  city: string;
  address: string;
} {
  const parsed = parseLocation(value);
  return { city: parsed.city, address: parsed.mapUrl ?? "" };
}

// ============================================================
// Client guard
// ============================================================
function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase ليس مهيأً");
  }
  return supabase;
}

// ============================================================
// CATEGORIES
// ============================================================
export async function fetchCategories(lang: AppLang): Promise<Category[]> {
  const { data, error } = await client()
    .from("categories")
    .select(
      "id, name, name_ar, name_en, slug, icon, color, sort_order, is_active",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as CategoryRow[]).map((r) => mapCategory(r, lang));
}

// ============================================================
// PROVIDERS
// ============================================================
const PROVIDER_SELECT = `
  id, user_id, category_id, name, name_ar, name_en,
  description, description_ar, description_en,
  city, phone, email, cover_url,
  logo_url, commercial_registration_path, tax_number_path,
  national_address_path, commission_rate_snapshot,
  verification_rejection_reason,
  rating_avg, rating_count, is_active,
  verification_status, working_hours,
  category:categories ( slug ),
  provider_images ( url, sort_order ),
  services (
    id, provider_id, title, title_ar, title_en,
    description, description_ar, description_en,
    price, duration, duration_minutes, is_active, images
  )
`;

export async function fetchProviders(lang: AppLang): Promise<Provider[]> {
  const { data, error } = await client()
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq("is_active", true)
    .eq("verification_status", "approved");
  if (error) throw error;
  return ((data ?? []) as unknown as ProviderRow[]).map((r) =>
    mapProvider(
      {
        ...r,
        services: (r.services ?? []).filter((s) => s.is_active !== false),
      },
      lang,
    ),
  );
}

export async function fetchProviderById(
  id: string,
  lang: AppLang,
): Promise<Provider | null> {
  const { data, error } = await client()
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as ProviderRow;
  return mapProvider(
    { ...row, services: (row.services ?? []).filter((s) => s.is_active !== false) },
    lang,
  );
}

export async function fetchProviderByOwner(
  userId: string,
  lang: AppLang,
): Promise<Provider | null> {
  const { data, error } = await client()
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as ProviderRow;
  return mapProvider(
    { ...row, services: (row.services ?? []).filter((s) => s.is_active !== false) },
    lang,
  );
}

export interface CreateProviderInput {
  userId: string;
  categoryId: string;
  name: string;
  description?: string;
  city?: string;
  phone?: string;
  email?: string;
}

export async function createProvider(
  input: CreateProviderInput,
): Promise<{ id: string }> {
  const { data, error } = await client()
    .from("providers")
    .insert({
      user_id: input.userId,
      category_id: input.categoryId,
      name: input.name,
      name_ar: input.name,
      description: input.description ?? null,
      description_ar: input.description ?? null,
      city: input.city ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

export interface UpdateProviderInput {
  name?: string;
  description?: string;
  categoryId?: string;
  city?: string;
  phone?: string;
  email?: string;
  coverUrl?: string | null;
}

export async function updateProvider(
  id: string,
  patch: UpdateProviderInput,
): Promise<void> {
  const next: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    next.name = patch.name;
    next.name_ar = patch.name;
  }
  if (patch.description !== undefined) {
    next.description = patch.description;
    next.description_ar = patch.description;
  }
  if (patch.categoryId !== undefined) next.category_id = patch.categoryId;
  if (patch.city !== undefined) next.city = patch.city;
  if (patch.phone !== undefined) next.phone = patch.phone;
  if (patch.email !== undefined) next.email = patch.email;
  if (patch.coverUrl !== undefined) next.cover_url = patch.coverUrl;
  if (Object.keys(next).length === 0) return;
  const { error } = await client().from("providers").update(next).eq("id", id);
  if (error) throw error;
}

// ============================================================
// SERVICES
// ============================================================
export interface UpsertServiceInput {
  id?: string; // omit for create
  providerId: string;
  titleAr: string;
  titleEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  price: number;
  duration?: string;
  durationMinutes: number;
}

export async function upsertService(
  input: UpsertServiceInput,
): Promise<{ id: string }> {
  const c = client();
  // `title` (the legacy column) keeps the Arabic text for backward compatibility
  // with any code that reads it directly. New code reads title_ar / title_en.
  const payload = {
    title: input.titleAr,
    title_ar: input.titleAr,
    title_en: input.titleEn,
    description: input.descriptionAr ?? null,
    description_ar: input.descriptionAr ?? null,
    description_en: input.descriptionEn ?? null,
    price: input.price,
    duration: input.duration ?? null,
    duration_minutes: input.durationMinutes,
  };

  if (input.id) {
    const { data, error } = await c
      .from("services")
      .update(payload)
      .eq("id", input.id)
      .select("id")
      .single();
    if (error) throw error;
    return { id: (data as { id: string }).id };
  }
  const { data, error } = await c
    .from("services")
    .insert({
      ...payload,
      provider_id: input.providerId,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

/** Update only working_hours for a provider. */
export async function updateProviderWorkingHours(
  providerId: string,
  hours: WorkingHours,
): Promise<void> {
  const { error } = await client()
    .from("providers")
    .update({ working_hours: hours })
    .eq("id", providerId);
  if (error) throw error;
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await client().from("services").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// BOOKINGS
// ============================================================
const BOOKING_SELECT = `
  id, user_id, provider_id, service_id, service_title, price,
  start_at, end_at, city, address, notes, status,
  payment_status, payment_method, payment_id,
  commission_rate, created_at,
  user:users!bookings_user_id_fkey ( full_name, phone, email ),
  reviews ( id, booking_id, user_id, provider_id, rating, comment, created_at )
`;

export async function fetchUserBookings(
  userId: string,
  lang: AppLang,
): Promise<Booking[]> {
  const { data, error } = await client()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as BookingRow[]).map((r) => mapBooking(r, lang));
}

export async function fetchProviderBookings(
  providerId: string,
  lang: AppLang,
): Promise<Booking[]> {
  const { data, error } = await client()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as BookingRow[]).map((r) => mapBooking(r, lang));
}

/** Fetch the busy intervals for a provider on a given local date, via the
 *  SECURITY DEFINER RPC. Used by the booking form to filter unavailable slots.
 */
export async function fetchProviderBusyIntervals(
  providerId: string,
  date: Date,
): Promise<{ start: Date; end: Date }[]> {
  const day = formatLocalDate(date);
  const { data, error } = await client().rpc("provider_busy_intervals", {
    p_id: providerId,
    day,
  });
  if (error) throw error;
  return ((data ?? []) as { start_at: string; end_at: string }[]).map((r) => ({
    start: new Date(r.start_at),
    end: new Date(r.end_at),
  }));
}

export async function fetchBookingById(
  id: string,
  lang: AppLang,
): Promise<Booking | null> {
  const { data, error } = await client()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapBooking(data as unknown as BookingRow, lang);
}

export interface CreateBookingInput {
  userId: string;
  providerId: string;
  serviceId: string;
  serviceTitle: string;
  price: number;
  startAt: Date;
  endAt: Date;
  city: string;
  address: string;
  notes: string;
}

/** Postgres exclusion-constraint code surfaced as a SQLSTATE 23P01 by supabase-js. */
export const SLOT_TAKEN_ERROR = "SLOT_TAKEN";

export async function createBooking(
  input: CreateBookingInput,
  lang: AppLang = "ar",
): Promise<Booking> {
  // Wrap the supabase builder in a real Promise so withTimeout's race works.
  const op: Promise<{ data: unknown; error: { message?: string; code?: string } | null }> =
    Promise.resolve(
      client()
        .from("bookings")
        .insert({
          user_id: input.userId,
          provider_id: input.providerId,
          service_id: input.serviceId,
          service_title: input.serviceTitle,
          price: input.price,
          start_at: input.startAt.toISOString(),
          end_at: input.endAt.toISOString(),
          city: input.city,
          address: input.address,
          notes: input.notes,
          status: "pending" as BookingStatus,
        })
        .select(BOOKING_SELECT)
        .single(),
    );
  const { data, error } = await withTimeout(op);
  if (error) {
    if (
      (error as { code?: string }).code === "23P01" ||
      /no_overlap/i.test(error.message ?? "")
    ) {
      throw new Error(SLOT_TAKEN_ERROR);
    }
    throw error;
  }
  return mapBooking(data as unknown as BookingRow, lang);
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<void> {
  const { error } = await client()
    .from("bookings")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

// ============================================================
// REVIEWS
// ============================================================
export async function createReview(input: {
  bookingId: string;
  userId: string;
  providerId: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const { error } = await client().from("reviews").insert({
    booking_id: input.bookingId,
    user_id: input.userId,
    provider_id: input.providerId,
    rating: input.rating,
    comment: input.comment || null,
  });
  if (error) throw error;
}

// ============================================================
// NOTIFICATIONS
// ============================================================
export async function fetchNotifications(
  userId: string,
): Promise<AppNotification[]> {
  const { data, error } = await client()
    .from("notifications")
    .select("id, user_id, title, body, booking_id, is_read, created_at")
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as NotificationRow[]).map(mapNotification);
}

export async function markAllNotificationsRead(
  userId: string,
): Promise<void> {
  const { error } = await client()
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
}

// ============================================================
// APP SETTINGS — العمولة العامة
// ============================================================
export async function fetchCommissionRate(): Promise<number> {
  const { data, error } = await client()
    .from("app_settings")
    .select("value")
    .eq("key", "commission_rate")
    .maybeSingle();
  if (error) throw error;
  if (!data) return 10;
  const raw = (data as { value: unknown }).value;
  const num = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(num) ? num : 10;
}

// ============================================================
// ADMIN — categories CRUD, broadcast, commission settings
// ============================================================
export async function adminAddCategory(input: {
  name: string;
  slug: string;
  icon?: string;
  color?: string;
}): Promise<void> {
  const { error } = await client()
    .from("categories")
    .insert({
      name: input.name,
      name_ar: input.name,
      slug: input.slug,
      icon: input.icon ?? "star",
      color: input.color ?? "#7b2cbf",
      is_active: true,
    });
  if (error) throw error;
}

export async function adminRemoveCategory(id: string): Promise<void> {
  const { error } = await client().from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function adminSetCommissionRate(rate: number): Promise<void> {
  const { error } = await client()
    .from("app_settings")
    .upsert({ key: "commission_rate", value: rate }, { onConflict: "key" });
  if (error) throw error;
}

export async function adminBroadcastNotification(input: {
  title: string;
  body: string;
}): Promise<void> {
  // user_id = null means broadcast (visible to all via the SELECT policy).
  const { error } = await client().from("notifications").insert({
    user_id: null,
    title: input.title,
    body: input.body,
  });
  if (error) throw error;
}

// ============================================================
// SUPPORT TICKETS
// ============================================================

export type TicketStatus = "open" | "in_progress" | "closed";

export interface SupportTicket {
  id: string;
  userId: string;
  userRole: "customer" | "provider" | "admin";
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  subject: string;
  message: string;
  status: TicketStatus;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

interface TicketRow {
  id: string;
  user_id: string;
  user_role: "customer" | "provider" | "admin";
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  subject: string;
  message: string;
  status: TicketStatus;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

function mapTicket(row: TicketRow): SupportTicket {
  return {
    id: row.id,
    userId: row.user_id,
    userRole: row.user_role,
    userName: row.user_name,
    userEmail: row.user_email,
    userPhone: row.user_phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    adminReply: row.admin_reply,
    repliedAt: row.replied_at,
    createdAt: row.created_at,
  };
}

const TICKET_SELECT =
  "id, user_id, user_role, user_name, user_email, user_phone, subject, message, status, admin_reply, replied_at, created_at";

export async function fetchUserTickets(
  userId: string,
): Promise<SupportTicket[]> {
  const { data, error } = await client()
    .from("support_tickets")
    .select(TICKET_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as TicketRow[]).map(mapTicket);
}

export interface CreateTicketInput {
  userId: string;
  userRole: "customer" | "provider" | "admin";
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  subject: string;
  message: string;
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<SupportTicket> {
  const { data, error } = await client()
    .from("support_tickets")
    .insert({
      user_id: input.userId,
      user_role: input.userRole,
      user_name: input.userName,
      user_email: input.userEmail,
      user_phone: input.userPhone,
      subject: input.subject,
      message: input.message,
    })
    .select(TICKET_SELECT)
    .single();
  if (error) throw error;
  return mapTicket(data as TicketRow);
}

// Admin
export interface TicketFilters {
  status?: TicketStatus;
  role?: "customer" | "provider" | "admin";
}

export async function adminFetchAllTickets(
  filters?: TicketFilters,
): Promise<SupportTicket[]> {
  let q = client()
    .from("support_tickets")
    .select(TICKET_SELECT)
    .order("created_at", { ascending: false });
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.role) q = q.eq("user_role", filters.role);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as TicketRow[]).map(mapTicket);
}

export async function adminReplyToTicket(input: {
  id: string;
  reply: string;
  status: TicketStatus;
}): Promise<void> {
  const { error } = await client()
    .from("support_tickets")
    .update({
      admin_reply: input.reply,
      replied_at: new Date().toISOString(),
      status: input.status,
    })
    .eq("id", input.id);
  if (error) throw error;
}

// ============================================================
// APP CONTENT (about-app)
// ============================================================

export interface AppContentEntry {
  key: string;
  valueAr: string;
  valueEn: string;
  updatedAt: string;
}

interface AppContentRow {
  key: string;
  value_ar: string;
  value_en: string;
  updated_at: string;
}

export async function fetchAppContent(): Promise<AppContentEntry[]> {
  const { data, error } = await client()
    .from("app_content")
    .select("key, value_ar, value_en, updated_at")
    .order("key", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as AppContentRow[]).map((r) => ({
    key: r.key,
    valueAr: r.value_ar,
    valueEn: r.value_en,
    updatedAt: r.updated_at,
  }));
}

export async function adminUpdateAppContent(
  key: string,
  patch: { valueAr?: string; valueEn?: string },
): Promise<void> {
  const next: Record<string, unknown> = {};
  if (patch.valueAr !== undefined) next.value_ar = patch.valueAr;
  if (patch.valueEn !== undefined) next.value_en = patch.valueEn;
  if (Object.keys(next).length === 0) return;
  const { error } = await client().from("app_content").update(next).eq("key", key);
  if (error) throw error;
}

// ============================================================
// ADMIN — users + bookings (full lists, RLS allows admins)
// ============================================================

export interface AdminUserRow {
  id: string;
  authUserId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: "customer" | "provider" | "admin";
  city: string | null;
  profileCompleted: boolean;
  language: "ar" | "en" | null;
  avatarUrl: string | null;
  createdAt: string;
}

export async function adminFetchAllUsers(filters?: {
  role?: "customer" | "provider" | "admin";
}): Promise<AdminUserRow[]> {
  let q = client()
    .from("users")
    .select(
      "id, auth_user_id, email, full_name, phone, role, city, profile_completed, language, avatar_url, created_at",
    )
    .order("created_at", { ascending: false });
  if (filters?.role) q = q.eq("role", filters.role);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string;
    auth_user_id: string;
    email: string | null;
    full_name: string | null;
    phone: string | null;
    role: "customer" | "provider" | "admin";
    city: string | null;
    profile_completed: boolean;
    language: "ar" | "en" | null;
    avatar_url: string | null;
    created_at: string;
  }>).map((r) => ({
    id: r.id,
    authUserId: r.auth_user_id,
    email: r.email,
    fullName: r.full_name,
    phone: r.phone,
    role: r.role,
    city: r.city,
    profileCompleted: r.profile_completed,
    language: r.language,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
  }));
}

export async function adminSetUserRole(
  userId: string,
  role: "customer" | "provider" | "admin",
): Promise<void> {
  const { error } = await client()
    .from("users")
    .update({ role })
    .eq("id", userId);
  if (error) throw error;
}

export async function adminFetchAllBookings(
  filters?: { status?: BookingStatus },
  lang: AppLang = "ar",
): Promise<Booking[]> {
  let q = client()
    .from("bookings")
    .select(BOOKING_SELECT)
    .order("created_at", { ascending: false });
  if (filters?.status) q = q.eq("status", filters.status);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as BookingRow[]).map((r) =>
    mapBooking(r, lang),
  );
}

// ============================================================
// CITIES (from DB)
// ============================================================
export interface City {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
}

interface CityRow {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  is_active: boolean;
  sort_order: number | null;
}

export async function fetchCities(): Promise<City[]> {
  const { data, error } = await client()
    .from("cities")
    .select("id, slug, name_ar, name_en, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as CityRow[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    nameAr: r.name_ar,
    nameEn: r.name_en,
    isActive: r.is_active,
  }));
}

// ============================================================
// PROVIDER SERVICE AREAS
// ============================================================
export async function fetchProviderServiceAreas(
  providerId: string,
): Promise<string[]> {
  const { data, error } = await client()
    .from("provider_service_areas")
    .select("city")
    .eq("provider_id", providerId);
  if (error) throw error;
  return ((data ?? []) as { city: string }[]).map((r) => r.city);
}

export async function setProviderServiceAreas(
  providerId: string,
  cities: string[],
): Promise<void> {
  const c = client();
  // Replace strategy: delete all then insert.
  const { error: delErr } = await c
    .from("provider_service_areas")
    .delete()
    .eq("provider_id", providerId);
  if (delErr) throw delErr;
  if (cities.length === 0) return;
  const { error: insErr } = await c
    .from("provider_service_areas")
    .insert(cities.map((city) => ({ provider_id: providerId, city })));
  if (insErr) throw insErr;
}

// ============================================================
// PROVIDER VERIFICATION (admin)
// ============================================================
export async function adminFetchProvidersByStatus(
  status: VerificationStatus,
  lang: AppLang,
): Promise<Provider[]> {
  const { data, error } = await client()
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq("verification_status", status)
    .order("created_at" as never, { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as ProviderRow[]).map((r) =>
    mapProvider(
      { ...r, services: (r.services ?? []).filter((s) => s.is_active !== false) },
      lang,
    ),
  );
}

export async function adminApproveProvider(providerId: string): Promise<void> {
  // Notification is fired automatically by the
  // notify_verification_change trigger (migration v8).
  const { error } = await client()
    .from("providers")
    .update({
      verification_status: "approved",
      verification_rejection_reason: null,
    })
    .eq("id", providerId);
  if (error) throw error;
}

export async function adminRejectProvider(
  providerId: string,
  reason: string,
): Promise<void> {
  // Set the reason BEFORE/atomically with the status flip — the trigger reads
  // verification_rejection_reason and uses it as the notification body.
  const trimmed = (reason ?? "").trim();
  const { error } = await client()
    .from("providers")
    .update({
      verification_status: "rejected",
      verification_rejection_reason: trimmed || null,
    })
    .eq("id", providerId);
  if (error) throw error;
}

// Back-compat: kept signature so older imports don't break
export async function adminSetProviderVerification(
  providerId: string,
  status: VerificationStatus,
): Promise<void> {
  if (status === "approved") return adminApproveProvider(providerId);
  if (status === "rejected") return adminRejectProvider(providerId, "");
  const { error } = await client()
    .from("providers")
    .update({ verification_status: status })
    .eq("id", providerId);
  if (error) throw error;
}

// ============================================================
// AUDIT LOG (admin read-only)
// ============================================================
export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  payload: unknown;
  createdAt: string;
}

interface AuditRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  payload: unknown;
  created_at: string;
}

export async function adminFetchAuditLog(filters?: {
  action?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  let q = client()
    .from("audit_log")
    .select("id, actor_user_id, action, target_table, target_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 100);
  if (filters?.action) q = q.eq("action", filters.action);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as AuditRow[]).map((r) => ({
    id: r.id,
    actorUserId: r.actor_user_id,
    action: r.action,
    targetTable: r.target_table,
    targetId: r.target_id,
    payload: r.payload,
    createdAt: r.created_at,
  }));
}

// ============================================================
// CUSTOMER FAVORITES
// ============================================================
export async function fetchUserFavorites(userId: string): Promise<string[]> {
  const { data, error } = await client()
    .from("customer_favorites")
    .select("provider_id")
    .eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as { provider_id: string }[]).map((r) => r.provider_id);
}

export async function toggleFavorite(
  userId: string,
  providerId: string,
  add: boolean,
): Promise<void> {
  const c = client();
  if (add) {
    const { error } = await c
      .from("customer_favorites")
      .insert({ user_id: userId, provider_id: providerId });
    if (error && (error as { code?: string }).code !== "23505") throw error;
  } else {
    const { error } = await c
      .from("customer_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("provider_id", providerId);
    if (error) throw error;
  }
}

// ============================================================
// PROVIDER ONBOARDING — atomic via RPC (replaces createProvider + role update)
// ============================================================
export async function becomeProvider(input: {
  categoryId: string;
  name: string;
  description?: string;
  city?: string;
  phone?: string;
  email?: string;
  logoUrl?: string | null;
  commercialRegistrationPath?: string | null;
  taxNumberPath?: string | null;
  nationalAddressPath?: string | null;
}): Promise<{ id: string }> {
  const { data, error } = await client().rpc("become_provider", {
    p_category_id: input.categoryId,
    p_name: input.name,
    p_description: input.description ?? null,
    p_city: input.city ?? null,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
    p_logo_url: input.logoUrl ?? null,
    p_commercial_registration_path: input.commercialRegistrationPath ?? null,
    p_tax_number_path: input.taxNumberPath ?? null,
    p_national_address_path: input.nationalAddressPath ?? null,
  });
  if (error) throw error;
  return { id: data as string };
}

// ============================================================
// ADMIN — dashboard stats
// ============================================================

export interface DashboardStats {
  totalUsers: number;
  totalCustomers: number;
  totalProviders: number;
  totalBookings: number;
  completedBookings: number;
  pendingBookings: number;
  totalRevenue: number;
  openTickets: number;
}

export async function adminFetchDashboardStats(): Promise<DashboardStats> {
  const c = client();
  const [usersRes, bookingsRes, ticketsRes] = await Promise.all([
    c.from("users").select("role", { count: "exact" }),
    c.from("bookings").select("status, price"),
    c.from("support_tickets").select("status", { count: "exact" }).eq("status", "open"),
  ]);
  if (usersRes.error) throw usersRes.error;
  if (bookingsRes.error) throw bookingsRes.error;
  if (ticketsRes.error) throw ticketsRes.error;

  const users = (usersRes.data ?? []) as { role: string }[];
  const totalUsers = users.length;
  const totalCustomers = users.filter((u) => u.role === "customer").length;
  const totalProviders = users.filter((u) => u.role === "provider").length;

  const bookings = (bookingsRes.data ?? []) as {
    status: BookingStatus;
    price: number | string;
  }[];
  const completed = bookings.filter((b) => b.status === "completed");
  const pending = bookings.filter((b) => b.status === "pending");
  const totalRevenue = completed.reduce((s, b) => s + Number(b.price), 0);

  return {
    totalUsers,
    totalCustomers,
    totalProviders,
    totalBookings: bookings.length,
    completedBookings: completed.length,
    pendingBookings: pending.length,
    totalRevenue,
    openTickets: ticketsRes.count ?? 0,
  };
}
