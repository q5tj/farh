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
  slug: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  iban: string | null;
  iban_document_path: string | null;
  moyasar_seller_id: string | null;
  cover_url: string | null;
  logo_url: string | null;
  commercial_registration_path: string | null;
  tax_number_path: string | null;
  national_address_path: string | null;
  commission_rate_snapshot: number | string | null;
  verification_rejection_reason: string | null;
  lat: number | string | null;
  lng: number | string | null;
  rating_avg: number | null;
  rating_count: number | null;
  is_active: boolean | null;
  verification_status: VerificationStatus | null;
  moyasar_status: string | null;
  working_hours: WorkingHoursRow | null;
  category?: { slug: string } | null;
  provider_images?: GalleryItemRow[] | null;
  services?: ServiceRow[] | null;
}

interface GalleryItemRow {
  id: string;
  provider_id: string;
  kind: MediaKind;
  url: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | string | null;
  thumbnail_url: string | null;
  caption: string | null;
  sort_order: number | null;
  created_at: string;
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
  deposit_amount: number | string | null;
  deposit_paid_at: string | null;
  final_payment_method: "online" | "cash" | "bank_transfer" | null;
  final_payment_status: "not_required" | "pending" | "paid" | null;
  final_payment_at: string | null;
  commission_rate: number | string | null;
  commission_status: CommissionStatus | null;
  commission_amount: number | string | null;
  commission_paid_at: string | null;
  commission_payment_note: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  refund_status: RefundStatus | null;
  reschedule_status: "none" | "pending" | "accepted" | "rejected" | null;
  reschedule_count: number | null;
  rescheduled_from_at: string | null;
  created_at: string;
  user?: { full_name: string | null; phone: string | null; email: string | null } | null;
  provider?: { name: string | null; name_ar: string | null } | null;
  reviews?: ReviewRow[] | null;
}

interface ReviewRow {
  id: string;
  booking_id: string;
  user_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  is_hidden: boolean | null;
  hidden_reason: string | null;
  hidden_at: string | null;
  created_at: string;
  user?: { full_name: string | null } | null;
  provider?: { name: string | null; name_ar: string | null } | null;
}

interface NotificationRow {
  id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  title_ar: string | null;
  title_en: string | null;
  body_ar: string | null;
  body_en: string | null;
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

export type RefundStatus =
  | "not_required"
  | "pending"
  | "completed"
  | "failed";

export type CommissionStatus = "owed" | "paid" | "waived";

export type MediaKind = "image" | "video" | "file";

export type VerificationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_update";

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
  description: string; // localized
  descriptionAr: string;
  descriptionEn: string | null;
  price: number;
  /**
   * Legacy free-text label (e.g. "4 hours"). Kept on the model for
   * backwards compatibility with imported rows, but new UI should
   * derive the display label from `durationMinutes` via
   * `formatDurationMinutes` so the customer-facing text always
   * matches the slot length used by the booking calendar.
   */
  duration: string;
  durationMinutes: number;
  /** Hidden services don't appear in public browsing / booking. */
  isActive: boolean;
  /** First entry rendered on the marketplace card; rest available as gallery. */
  images: string[];
}

export interface Provider {
  id: string;
  /** URL-safe identifier derived from name_en. Use this for routes. */
  slug: string;
  userId: string | null;
  categoryId: string;
  categorySlug: string; // for COVER_BY_CATEGORY fallback
  name: string; // localized
  nameAr: string;
  nameEn: string | null;
  description: string; // localized
  descriptionEn: string | null;
  city: string;
  phone: string;
  email: string | null;
  iban: string | null;
  ibanDocumentPath: string | null;
  moyasarSellerId: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  commercialRegistrationPath: string | null;
  taxNumberPath: string | null;
  nationalAddressPath: string | null;
  commissionRateSnapshot: number | null;
  verificationRejectionReason: string | null;
  lat: number | null;
  lng: number | null;
  rating: number;
  reviews: number;
  priceFrom: number;
  isActive: boolean;
  verificationStatus: VerificationStatus;
  /** Moyasar connection status. Catalog only shows 'active' providers
   *  (booking deposit would otherwise fail). Admin can list non-active
   *  ones via adminFetchProvidersForMoyasar. */
  moyasarStatus: string | null;
  /** First N URLs only — for backwards compatibility with existing screens. */
  gallery: string[];
  galleryItems: GalleryItem[];
  services: ProviderService[];
  workingHours: WorkingHours;
}

export interface GalleryItem {
  id: string;
  providerId: string;
  kind: MediaKind;
  url: string;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  thumbnailUrl: string | null;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
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
  depositAmount: number | null;
  depositPaidAt: string | null;
  finalPaymentMethod: "online" | "cash" | "bank_transfer" | null;
  finalPaymentStatus: "not_required" | "pending" | "paid";
  finalPaymentAt: string | null;
  refundStatus: RefundStatus;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  // v31: reschedule lifecycle. Customer can request a new time; provider
  // accepts/rejects. Only one request can be 'pending' at a time.
  rescheduleStatus: "none" | "pending" | "accepted" | "rejected";
  rescheduleCount: number;
  rescheduledFromAt: string | null;
  providerName: string | null;
  createdAt: number; // ms
  rating: number | null;
  reviewText: string | null;
  commissionStatus: CommissionStatus;
  commissionAmount: number;
  commissionPaidAt: string | null;
  commissionPaymentNote: string | null;
}

export interface AppNotification {
  id: string;
  /** Localized at fetch time, falls back to legacy single-string copy. */
  title: string;
  body: string;
  // Bilingual snapshots — keep so a UI language change re-renders the
  // list with the right copy without a refetch.
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
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
    description: pickLocalized(
      row.description_ar,
      row.description_en,
      row.description ?? "",
      lang,
    ),
    descriptionAr: row.description_ar ?? row.description ?? "",
    descriptionEn: row.description_en,
    price: Number(row.price),
    duration: row.duration ?? "",
    durationMinutes: Number(row.duration_minutes ?? 60),
    isActive: row.is_active ?? true,
    images: row.images ?? [],
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

function mapGalleryItem(row: GalleryItemRow): GalleryItem {
  return {
    id: row.id,
    providerId: row.provider_id,
    kind: row.kind,
    url: row.url,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
    thumbnailUrl: row.thumbnail_url,
    caption: row.caption,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}

function mapProvider(row: ProviderRow, lang: AppLang): Provider {
  const services = (row.services ?? []).map((s) => mapService(s, lang));
  const prices = services.map((s) => s.price).filter((p) => p > 0);
  const priceFrom = prices.length ? Math.min(...prices) : 0;

  const galleryItems = (row.provider_images ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(mapGalleryItem);

  // Backward-compat: legacy callers expect a string[] of image URLs.
  const gallery = galleryItems
    .filter((g) => g.kind === "image")
    .map((g) => g.url);

  return {
    id: row.id,
    slug: row.slug,
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
    descriptionEn: row.description_en,
    city: row.city ?? "",
    phone: row.phone ?? "",
    email: row.email,
    iban: row.iban ?? null,
    ibanDocumentPath: row.iban_document_path ?? null,
    moyasarSellerId: row.moyasar_seller_id ?? null,
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
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    rating: Number(row.rating_avg ?? 0),
    reviews: Number(row.rating_count ?? 0),
    priceFrom,
    isActive: row.is_active ?? true,
    verificationStatus: row.verification_status ?? "pending",
    moyasarStatus: row.moyasar_status ?? null,
    gallery,
    galleryItems,
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
    depositAmount: row.deposit_amount != null ? Number(row.deposit_amount) : null,
    depositPaidAt: row.deposit_paid_at ?? null,
    finalPaymentMethod: row.final_payment_method ?? null,
    finalPaymentStatus: row.final_payment_status ?? "not_required",
    finalPaymentAt: row.final_payment_at ?? null,
    refundStatus: row.refund_status ?? "not_required",
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancellationReason: row.cancellation_reason,
    providerName: pickLocalized(
      row.provider?.name_ar ?? null,
      null,
      row.provider?.name ?? "",
      lang,
    ) || null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    rating: review?.rating ?? null,
    reviewText: review?.comment ?? null,
    commissionStatus: row.commission_status ?? "owed",
    commissionAmount:
      row.commission_amount != null ? Number(row.commission_amount) : 0,
    commissionPaidAt: row.commission_paid_at,
    commissionPaymentNote: row.commission_payment_note,
    rescheduleStatus: row.reschedule_status ?? "none",
    rescheduleCount: row.reschedule_count ?? 0,
    rescheduledFromAt: row.rescheduled_from_at,
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
    titleAr: row.title_ar ?? row.title ?? "",
    titleEn: row.title_en ?? row.title ?? "",
    bodyAr: row.body_ar ?? row.body ?? "",
    bodyEn: row.body_en ?? row.body ?? "",
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
  id, user_id, category_id, slug, name, name_ar, name_en,
  description, description_ar, description_en,
  city, phone, email, iban, iban_document_path, moyasar_seller_id, cover_url,
  logo_url, commercial_registration_path, tax_number_path,
  national_address_path, commission_rate_snapshot,
  verification_rejection_reason,
  lat, lng,
  rating_avg, rating_count, is_active,
  verification_status, moyasar_status, working_hours,
  category:categories ( slug ),
  provider_images (
    id, provider_id, kind, url, storage_path, mime_type,
    size_bytes, thumbnail_url, caption, sort_order, created_at
  ),
  services (
    id, provider_id, title, title_ar, title_en,
    description, description_ar, description_en,
    price, duration, duration_minutes, is_active, images
  )
`;

export async function fetchProviders(lang: AppLang): Promise<Provider[]> {
  // Hide providers without an active Moyasar connection. Without it,
  // deposit checkout returns "provider_not_connected" from the Edge
  // Function — so showing the listing is a dead end for the customer.
  const { data, error } = await client()
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq("is_active", true)
    .eq("verification_status", "approved")
    .eq("moyasar_status", "active");
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

// UUIDs (8-4-4-4-12 hex). Anything else is treated as a slug. This lets
// the [id] route accept either form without breaking older deep links.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchProviderById(
  idOrSlug: string,
  lang: AppLang,
): Promise<Provider | null> {
  const isUuid = UUID_RE.test(idOrSlug);
  const { data, error } = await client()
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq(isUuid ? "id" : "slug", idOrSlug)
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
  // Provider owners need to see their disabled services too so they can
  // re-enable them. Public-facing fetches (fetchProviderById, the catalog
  // in AppContext) filter them out instead.
  return mapProvider(row, lang);
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
  /** Optional product images (first one is the marketplace card thumbnail). */
  images?: string[];
  /** Optional active flag. Omit on create (defaults to true). */
  isActive?: boolean;
}

export async function upsertService(
  input: UpsertServiceInput,
): Promise<{ id: string }> {
  const c = client();
  // `title` (the legacy column) keeps the Arabic text for backward compatibility
  // with any code that reads it directly. New code reads title_ar / title_en.
  const payload: Record<string, unknown> = {
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
  if (input.images !== undefined) {
    payload.images = input.images;
  }
  if (input.isActive !== undefined) {
    payload.is_active = input.isActive;
  }

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
      is_active: input.isActive ?? true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

/** Flip a service's visibility. Owning provider (or admin) per RLS. */
export async function setServiceActive(
  serviceId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await client()
    .from("services")
    .update({ is_active: isActive })
    .eq("id", serviceId);
  if (error) throw error;
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

/** Patch the provider's own profile fields (RLS allows the owning user). */
export async function updateOwnProvider(
  providerId: string,
  patch: {
    name?: string;
    nameEn?: string;
    description?: string;
    descriptionEn?: string;
    logoUrl?: string | null;
    coverUrl?: string | null;
    phone?: string;
  },
): Promise<void> {
  const next: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    next.name = patch.name;
    // Mirror Arabic name into the bilingual column to stay consistent
    // with how `become_provider` seeds the row.
    next.name_ar = patch.name;
  }
  if (patch.nameEn !== undefined) {
    next.name_en = patch.nameEn;
  }
  if (patch.description !== undefined) {
    next.description = patch.description;
    next.description_ar = patch.description;
  }
  if (patch.descriptionEn !== undefined) {
    next.description_en = patch.descriptionEn;
  }
  if (patch.logoUrl !== undefined) next.logo_url = patch.logoUrl;
  if (patch.coverUrl !== undefined) next.cover_url = patch.coverUrl;
  if (patch.phone !== undefined) next.phone = patch.phone;
  if (Object.keys(next).length === 0) return;
  const { error } = await client()
    .from("providers")
    .update(next)
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
  deposit_amount, deposit_paid_at,
  final_payment_method, final_payment_status, final_payment_at,
  commission_rate, commission_status, commission_amount,
  commission_paid_at, commission_payment_note,
  cancelled_at, cancelled_by, cancellation_reason, refund_status,
  reschedule_status, reschedule_count, rescheduled_from_at,
  created_at,
  user:users!bookings_user_id_fkey ( full_name, phone, email ),
  provider:providers!bookings_provider_id_fkey ( name, name_ar ),
  reviews ( id, booking_id, user_id, provider_id, rating, comment, created_at )
`;

export async function fetchUserBookings(
  userId: string,
  lang: AppLang,
): Promise<Booking[]> {
  // Best-effort lazy cleanup of abandoned-checkout rows. We don't block
  // on it — even if pg_cron is enabled and already running it, this is
  // cheap (empty delete in steady state). If the RPC isn't deployed yet
  // we silently swallow the error so older clients keep working.
  client()
    .rpc("cleanup_unpaid_bookings")
    .then(() => {})
    .catch(() => {});

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

// ============================================================
// Provider unavailable periods (manual time blocks)
// ============================================================

export interface UnavailablePeriod {
  id: string;
  providerId: string;
  /** null = blocks every service the provider owns. */
  serviceId: string | null;
  /** null = legacy/orphaned row whose service was deleted. */
  serviceTitle: string | null;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  createdAt: Date;
}

interface UnavailableRow {
  id: string;
  provider_id: string;
  service_id: string | null;
  start_at: string;
  end_at: string;
  reason: string | null;
  created_at: string;
  service: { title: string | null } | null;
}

function mapUnavailable(r: UnavailableRow): UnavailablePeriod {
  return {
    id: r.id,
    providerId: r.provider_id,
    serviceId: r.service_id,
    serviceTitle: r.service?.title ?? null,
    startAt: new Date(r.start_at),
    endAt: new Date(r.end_at),
    reason: r.reason,
    createdAt: new Date(r.created_at),
  };
}

/** Provider lists their own blocked windows, ordered upcoming-first. */
export async function fetchProviderUnavailablePeriods(
  providerId: string,
): Promise<UnavailablePeriod[]> {
  const { data, error } = await client()
    .from("provider_unavailable_periods")
    .select(
      "id, provider_id, service_id, start_at, end_at, reason, created_at, service:services(title)",
    )
    .eq("provider_id", providerId)
    .order("start_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as UnavailableRow[]).map(mapUnavailable);
}

export async function createUnavailablePeriod(input: {
  providerId: string;
  serviceId: string | null;
  startAt: Date;
  endAt: Date;
  reason?: string;
}): Promise<UnavailablePeriod> {
  const { data, error } = await client()
    .from("provider_unavailable_periods")
    .insert({
      provider_id: input.providerId,
      service_id: input.serviceId,
      start_at: input.startAt.toISOString(),
      end_at: input.endAt.toISOString(),
      reason: input.reason?.trim() || null,
    })
    .select(
      "id, provider_id, service_id, start_at, end_at, reason, created_at, service:services(title)",
    )
    .single();
  if (error) throw error;
  return mapUnavailable(data as unknown as UnavailableRow);
}

export async function deleteUnavailablePeriod(id: string): Promise<void> {
  const { error } = await client()
    .from("provider_unavailable_periods")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Fetch the busy intervals for a service on a given local date.
 *
 *  Used by the customer booking form, which now scopes availability to
 *  the chosen service: a venue with 3 halls can accept bookings on Hall
 *  A even while Hall B is taken at the same time. When `serviceId` is
 *  omitted we fall back to the legacy per-provider RPC so older callers
 *  (admin / calendar views) keep working.
 *
 *  The 8s timeout is a defensive measure — a hanging RPC (Supabase
 *  network blip, slow cold start, stale auth session) used to leave the
 *  booking form spinning indefinitely on "available times". After the
 *  timeout we fall back to an empty busy list rather than blocking the
 *  customer; if the result is wrong it'll fail on submit and the
 *  no-overlap constraint will protect the provider.
 */
export async function fetchProviderBusyIntervals(
  providerId: string,
  date: Date,
  serviceId?: string,
): Promise<{ start: Date; end: Date }[]> {
  const day = formatLocalDate(date);
  const rpcCall = serviceId
    ? client().rpc("service_busy_intervals", {
        p_provider_id: providerId,
        p_service_id: serviceId,
        day,
      })
    : client().rpc("provider_busy_intervals", {
        p_id: providerId,
        day,
      });

  const timeoutMs = 8000;
  const { data, error } = await Promise.race([
    rpcCall,
    new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(
        () => resolve({ data: null, error: { message: "busy_intervals_timeout" } }),
        timeoutMs,
      ),
    ),
  ]);
  if (error) {
    // If the new service-scoped RPC isn't deployed yet, fall back to the
    // provider-wide one so the customer can still see slots.
    if (serviceId && /service_busy_intervals|function .* does not exist/i.test(error.message)) {
      console.warn("[busy] service_busy_intervals missing, falling back to provider_busy_intervals");
      const fallback = await client().rpc("provider_busy_intervals", {
        p_id: providerId,
        day,
      });
      if (fallback.error) {
        console.warn("[busy] fallback also failed:", fallback.error.message);
        return [];
      }
      return ((fallback.data ?? []) as { start_at: string; end_at: string }[]).map((r) => ({
        start: new Date(r.start_at),
        end: new Date(r.end_at),
      }));
    }
    console.warn("[busy] fetch failed:", error.message);
    return [];
  }
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
/**
 * Insert a review for a completed booking, OR update the existing one
 * if the user is editing a previous rating. Uses upsert with
 * onConflict on `booking_id` (the table has a unique constraint there)
 * to avoid the SQLSTATE 23505 we used to get when a customer rated
 * the same booking twice.
 */
export async function createReview(input: {
  bookingId: string;
  userId: string;
  providerId: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const { error } = await client()
    .from("reviews")
    .upsert(
      {
        booking_id: input.bookingId,
        user_id: input.userId,
        provider_id: input.providerId,
        rating: input.rating,
        comment: input.comment || null,
      },
      { onConflict: "booking_id" },
    );
  if (error) throw error;
}

export interface ProviderReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string | null;
}

/**
 * All reviews for a provider — visible to anyone (RLS policy
 * `reviews_read_all` from migration v2). Hidden reviews
 * (`is_hidden = true`, set by admin moderation) are excluded.
 *
 * Why this exists: the provider detail page used to derive reviews from
 * the *current user's* bookings list, which only ever showed reviews
 * written by the viewer. This RPC-free query returns every customer's
 * review for the provider so visitors see real social proof.
 */
export async function fetchProviderReviews(
  providerId: string,
  limit = 50,
): Promise<ProviderReview[]> {
  const { data, error } = await client()
    .from("reviews")
    .select(
      "id, rating, comment, created_at, is_hidden, user:users!reviews_user_id_fkey ( full_name )",
    )
    .eq("provider_id", providerId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as ReviewRow[]).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    reviewerName: r.user?.full_name ?? null,
  }));
}

// ============================================================
// NOTIFICATIONS
// ============================================================
export async function fetchNotifications(
  userId: string,
): Promise<AppNotification[]> {
  // Try the v20 RPC first — it consolidates per-user `is_read` AND
  // broadcast notification_reads into a single `effective_read` column.
  const rpc = await client().rpc("fetch_user_notifications", {
    p_user_id: userId,
    p_limit: 100,
  });
  if (!rpc.error && rpc.data) {
    return (
      (rpc.data ?? []) as (NotificationRow & { effective_read: boolean })[]
    ).map((row) => {
      const mapped = mapNotification(row as NotificationRow);
      mapped.read = row.effective_read ?? mapped.read;
      return mapped;
    });
  }
  // Fallback to a direct SELECT if the RPC isn't deployed yet OR fails
  // for any reason (e.g. is_admin() missing on an older DB). We lose
  // the per-user broadcast read receipts in this branch, but the user
  // still sees their notifications instead of an empty list.
  console.warn(
    "[fetchNotifications] RPC failed, falling back to direct SELECT:",
    rpc.error?.message,
  );
  const { data, error } = await client()
    .from("notifications")
    .select(
      "id, user_id, title, body, title_ar, title_en, body_ar, body_en, booking_id, is_read, created_at",
    )
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as NotificationRow[]).map(mapNotification);
}

export async function markAllNotificationsRead(
  userId: string,
): Promise<void> {
  // Calls the v20 RPC which handles BOTH:
  //   1) UPDATE notifications SET is_read=true WHERE user_id=p_user_id
  //   2) INSERT INTO notification_reads for every broadcast not yet
  //      dismissed by this user (so the next fetch returns
  //      effective_read=true for those rows too).
  const { error } = await client().rpc("mark_all_notifications_read", {
    p_user_id: userId,
  });
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
  nameAr: string;
  nameEn: string;
  slug: string;
  icon?: string;
  color?: string;
}): Promise<void> {
  const { error } = await client()
    .from("categories")
    .insert({
      name: input.nameAr,
      name_ar: input.nameAr,
      name_en: input.nameEn,
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

/**
 * Payment-related app settings that the admin can tune from the dashboard.
 * Values are stored in app_settings.value as JSONB numbers.
 */
export interface PaymentSettings {
  depositPercentage: number;
  appShareFromDeposit: number;
  cancellationWindowFullDays: number;
  cancellationWindowHalfDays: number;
}

const PAYMENT_SETTING_KEYS = [
  "deposit_percentage",
  "app_share_from_deposit",
  "cancellation_window_full_days",
  "cancellation_window_half_days",
] as const;

const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  depositPercentage: 25,
  appShareFromDeposit: 10,
  cancellationWindowFullDays: 10,
  cancellationWindowHalfDays: 5,
};

export async function fetchPaymentSettings(): Promise<PaymentSettings> {
  const { data, error } = await client()
    .from("app_settings")
    .select("key, value")
    .in("key", PAYMENT_SETTING_KEYS as unknown as string[]);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const r = row as { key: string; value: unknown };
    const n = Number(r.value);
    if (Number.isFinite(n)) map.set(r.key, n);
  }
  return {
    depositPercentage:
      map.get("deposit_percentage") ?? DEFAULT_PAYMENT_SETTINGS.depositPercentage,
    appShareFromDeposit:
      map.get("app_share_from_deposit") ?? DEFAULT_PAYMENT_SETTINGS.appShareFromDeposit,
    cancellationWindowFullDays:
      map.get("cancellation_window_full_days") ?? DEFAULT_PAYMENT_SETTINGS.cancellationWindowFullDays,
    cancellationWindowHalfDays:
      map.get("cancellation_window_half_days") ?? DEFAULT_PAYMENT_SETTINGS.cancellationWindowHalfDays,
  };
}

export async function adminSavePaymentSettings(
  patch: Partial<PaymentSettings>,
): Promise<void> {
  const rows: { key: string; value: number }[] = [];
  if (patch.depositPercentage !== undefined)
    rows.push({ key: "deposit_percentage", value: patch.depositPercentage });
  if (patch.appShareFromDeposit !== undefined)
    rows.push({
      key: "app_share_from_deposit",
      value: patch.appShareFromDeposit,
    });
  if (patch.cancellationWindowFullDays !== undefined)
    rows.push({
      key: "cancellation_window_full_days",
      value: patch.cancellationWindowFullDays,
    });
  if (patch.cancellationWindowHalfDays !== undefined)
    rows.push({
      key: "cancellation_window_half_days",
      value: patch.cancellationWindowHalfDays,
    });
  if (rows.length === 0) return;
  const { error } = await client()
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
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

export async function fetchAppContentByKey(
  key: string,
): Promise<AppContentEntry | null> {
  const { data, error } = await client()
    .from("app_content")
    .select("key, value_ar, value_en, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as AppContentRow;
  return {
    key: r.key,
    valueAr: r.value_ar,
    valueEn: r.value_en,
    updatedAt: r.updated_at,
  };
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
  /** Set only when role = 'provider' and the providers row exists. */
  providerId: string | null;
  providerName: string | null;
}

export async function adminFetchAllUsers(filters?: {
  role?: "customer" | "provider" | "admin";
}): Promise<AdminUserRow[]> {
  // Two separate queries instead of a PostgREST embed: the embed was
  // returning zero rows whenever the providers FK relationship couldn't
  // be resolved by PostgREST (schema cache lag, ambiguity, RLS mismatch),
  // and the whole list collapsed to empty even though the dashboard card
  // happily counted 13. Running them in parallel and joining locally
  // isolates failure modes — even if the providers fetch fails, the user
  // list still renders.
  const c = client();
  let usersQ = c
    .from("users")
    .select(
      "id, auth_user_id, email, full_name, phone, role, city, profile_completed, language, avatar_url, created_at",
    )
    .order("created_at", { ascending: false });
  if (filters?.role) usersQ = usersQ.eq("role", filters.role);

  const [usersRes, providersRes] = await Promise.all([
    usersQ,
    c.from("providers").select("id, user_id, name"),
  ]);
  if (usersRes.error) throw usersRes.error;
  if (providersRes.error) {
    console.warn(
      "[adminFetchAllUsers] providers fetch failed, store names will be empty",
      providersRes.error,
    );
  }

  const providerByUserId = new Map<string, { id: string; name: string }>();
  for (const p of (providersRes.data ?? []) as {
    id: string;
    user_id: string;
    name: string;
  }[]) {
    providerByUserId.set(p.user_id, { id: p.id, name: p.name });
  }

  return ((usersRes.data ?? []) as Array<{
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
  }>).map((r) => {
    const provider = providerByUserId.get(r.id) ?? null;
    return {
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
      providerId: provider?.id ?? null,
      providerName: provider?.name ?? null,
    };
  });
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

/**
 * Demote a provider back to a customer with full cleanup. Deletes the
 * providers row (cascades to services/gallery/reviews/service_areas/
 * favorites; bookings.provider_id is SET NULL), wipes storage objects,
 * and flips users.role to 'customer'. See migration v13.
 */
export async function adminDemoteProvider(userId: string): Promise<{
  authUserId: string;
  deletedProviderId: string | null;
  storageObjectsDeleted: number;
}> {
  const { data, error } = await client().rpc("admin_demote_provider", {
    p_user_id: userId,
  });
  if (error) throw error;
  const payload = data as {
    auth_user_id: string;
    deleted_provider_id: string | null;
    storage_objects_deleted: number;
  };
  return {
    authUserId: payload.auth_user_id,
    deletedProviderId: payload.deleted_provider_id,
    storageObjectsDeleted: payload.storage_objects_deleted,
  };
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

/**
 * Admin report: all approved providers regardless of Moyasar status,
 * so the operator can see who still needs to connect their Moyasar
 * account and follow up with them via WhatsApp.
 */
export async function adminFetchAllApprovedProviders(
  lang: AppLang,
): Promise<Provider[]> {
  const { data, error } = await client()
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq("verification_status", "approved")
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

/** Admin requests the provider to fix data and resubmit. Status flips to
 *  'needs_update' with a mandatory reason. The provider can then edit
 *  their info and call providerResubmitForReview to send back to pending.
 */
export async function adminRequestProviderUpdate(
  providerId: string,
  reason: string,
): Promise<void> {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) {
    throw new Error("سبب طلب التحديث مطلوب");
  }
  const { error } = await client().rpc("admin_request_provider_update", {
    p_provider_id: providerId,
    p_reason: trimmed,
  });
  if (error) throw error;
}

/** Provider resubmits their (now updated) info for review. Flips
 *  needs_update → pending. Throws if the current user has no
 *  needs_update provider row.
 */
export async function providerResubmitForReview(): Promise<void> {
  const { error } = await client().rpc("provider_resubmit_for_review");
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
  actorName: string | null;
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
  actor?: { full_name: string | null; email: string | null } | null;
}

export async function adminFetchAuditLog(filters?: {
  action?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  let q = client()
    .from("audit_log")
    .select(
      "id, actor_user_id, action, target_table, target_id, payload, created_at, actor:users!audit_log_actor_user_id_fkey ( full_name, email )",
    )
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 100);
  if (filters?.action) q = q.eq("action", filters.action);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as AuditRow[]).map((r) => ({
    id: r.id,
    actorUserId: r.actor_user_id,
    actorName: r.actor?.full_name?.trim() || r.actor?.email || null,
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
  nameEn?: string;
  description?: string;
  descriptionEn?: string;
  city?: string;
  phone?: string;
  email?: string;
  iban?: string;
  ibanDocumentPath?: string | null;
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
  const providerId = data as string;
  // The RPC seeds Arabic columns from p_name/p_description and doesn't
  // accept the bilingual + IBAN fields. Follow up with a direct UPDATE
  // (RLS lets the owner edit their own row).
  if (
    input.nameEn ||
    input.descriptionEn ||
    input.iban ||
    input.ibanDocumentPath
  ) {
    const patch: Record<string, unknown> = {};
    if (input.nameEn) patch.name_en = input.nameEn;
    if (input.descriptionEn) patch.description_en = input.descriptionEn;
    if (input.iban) patch.iban = input.iban;
    if (input.ibanDocumentPath) patch.iban_document_path = input.ibanDocumentPath;
    if (Object.keys(patch).length > 0) {
      const { error: pErr } = await client()
        .from("providers")
        .update(patch)
        .eq("id", providerId);
      if (pErr) throw pErr;
    }
  }
  return { id: providerId };
}

// ============================================================
// PROVIDER GALLERY (images / videos / files)
// ============================================================
const GALLERY_COLS =
  "id, provider_id, kind, url, storage_path, mime_type, size_bytes, thumbnail_url, caption, sort_order, created_at";

export async function fetchProviderGallery(
  providerId: string,
): Promise<GalleryItem[]> {
  const { data, error } = await client()
    .from("provider_images")
    .select(GALLERY_COLS)
    .eq("provider_id", providerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as GalleryItemRow[]).map(mapGalleryItem);
}

export async function addGalleryItem(input: {
  providerId: string;
  kind: MediaKind;
  url: string;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  thumbnailUrl: string | null;
  caption?: string | null;
}): Promise<GalleryItem> {
  const c = client();
  // Compute the next sort_order so insert order is preserved.
  const { data: tail } = await c
    .from("provider_images")
    .select("sort_order")
    .eq("provider_id", input.providerId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    ((tail as { sort_order: number | null } | null)?.sort_order ?? 0) + 1;

  const { data, error } = await c
    .from("provider_images")
    .insert({
      provider_id: input.providerId,
      kind: input.kind,
      url: input.url,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      thumbnail_url: input.thumbnailUrl,
      caption: input.caption ?? null,
      sort_order: nextOrder,
    })
    .select(GALLERY_COLS)
    .single();
  if (error) throw error;
  return mapGalleryItem(data as GalleryItemRow);
}

export async function removeGalleryItem(
  itemId: string,
  storagePaths?: (string | null)[],
): Promise<void> {
  const c = client();
  const { error } = await c.from("provider_images").delete().eq("id", itemId);
  if (error) throw error;
  // Best-effort: clean up storage objects (the row is gone either way).
  if (storagePaths) {
    const paths = storagePaths.filter((p): p is string => !!p);
    if (paths.length > 0) {
      await c.storage
        .from("provider-media")
        .remove(paths)
        .catch(() => {});
    }
  }
}


// ============================================================
// BOOKING CANCELLATION (customer / provider / admin)
// ============================================================
export async function cancelBooking(
  bookingId: string,
  reason?: string,
): Promise<void> {
  const { error } = await client().rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: reason?.trim() ? reason.trim() : null,
  });
  if (error) throw error;
}


// ============================================================
// ADMIN — refund queue
// ============================================================
export async function adminFetchPendingRefunds(
  lang: AppLang,
): Promise<Booking[]> {
  const { data, error } = await client()
    .from("bookings")
    .select(BOOKING_SELECT)
    .in("refund_status", ["pending", "failed"])
    .order("cancelled_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as BookingRow[]).map((r) =>
    mapBooking(r, lang),
  );
}

export async function adminMarkRefund(
  bookingId: string,
  status: RefundStatus,
  note?: string,
): Promise<void> {
  const { error } = await client().rpc("admin_mark_refund", {
    p_booking_id: bookingId,
    p_status: status,
    p_note: note?.trim() ? note.trim() : null,
  });
  if (error) throw error;
}


// ============================================================
// ADMIN — review moderation
// ============================================================
export interface ReviewWithContext {
  id: string;
  bookingId: string;
  userId: string;
  providerId: string;
  rating: number;
  comment: string | null;
  isHidden: boolean;
  hiddenReason: string | null;
  hiddenAt: string | null;
  createdAt: string;
  userName: string | null;
  providerName: string | null;
}

function mapReviewWithContext(
  row: ReviewRow,
  lang: AppLang,
): ReviewWithContext {
  return {
    id: row.id,
    bookingId: row.booking_id,
    userId: row.user_id,
    providerId: row.provider_id,
    rating: row.rating,
    comment: row.comment,
    isHidden: row.is_hidden ?? false,
    hiddenReason: row.hidden_reason,
    hiddenAt: row.hidden_at,
    createdAt: row.created_at,
    userName: row.user?.full_name ?? null,
    providerName: pickLocalized(
      row.provider?.name_ar ?? null,
      null,
      row.provider?.name ?? "",
      lang,
    ) || null,
  };
}

export async function adminFetchReviews(
  filter: "all" | "visible" | "hidden",
  lang: AppLang,
): Promise<ReviewWithContext[]> {
  let q = client()
    .from("reviews")
    .select(
      "id, booking_id, user_id, provider_id, rating, comment, is_hidden, hidden_reason, hidden_at, created_at, user:users!reviews_user_id_fkey ( full_name ), provider:providers!reviews_provider_id_fkey ( name, name_ar )",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "visible") q = q.eq("is_hidden", false);
  else if (filter === "hidden") q = q.eq("is_hidden", true);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as ReviewRow[]).map((r) =>
    mapReviewWithContext(r, lang),
  );
}

export async function adminSetReviewHidden(
  reviewId: string,
  hidden: boolean,
  reason?: string,
): Promise<void> {
  const { error } = await client().rpc("admin_set_review_hidden", {
    p_review_id: reviewId,
    p_hidden: hidden,
    p_reason: reason?.trim() ? reason.trim() : null,
  });
  if (error) throw error;
}


// ============================================================
// PROVIDER GEOLOCATION
// ============================================================
export async function updateProviderLocation(
  providerId: string,
  lat: number,
  lng: number,
): Promise<void> {
  const { error } = await client()
    .from("providers")
    .update({ lat, lng })
    .eq("id", providerId);
  if (error) throw error;
}


// ============================================================
// CLIENT-SIDE PROVIDER FILTERING
// ============================================================
export interface ProviderFilters {
  query?: string;
  city?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minRating?: number | null;
}

export function filterProviders(
  providers: Provider[],
  f: ProviderFilters,
): Provider[] {
  const q = f.query?.trim() ?? "";
  return providers.filter((p) => {
    if (q) {
      if (
        !p.name.includes(q) &&
        !p.city.includes(q) &&
        !p.description.includes(q)
      ) {
        return false;
      }
    }
    if (f.city && p.city !== f.city) return false;
    if (f.minPrice != null && p.priceFrom > 0 && p.priceFrom < f.minPrice) {
      return false;
    }
    if (f.maxPrice != null && p.priceFrom > f.maxPrice) return false;
    if (f.minRating != null && p.rating < f.minRating) return false;
    return true;
  });
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


// ============================================================
// PER-BOOKING COMMISSION ACCOUNTING
// ============================================================

export interface ProviderFinancialSummary {
  totalCompleted: number;
  totalRevenue: number;
  totalOwed: number;
  totalPaid: number;
  totalWaived: number;
  balance: number;
}

export interface ProviderWithFinancials {
  provider: Provider;
  totalRevenue: number;
  totalOwed: number;
  totalPaid: number;
  totalWaived: number;
  balance: number;
  completedCount: number;
}

interface SummaryRow {
  total_completed: number | string | null;
  total_revenue: number | string | null;
  total_commission_owed: number | string | null;
  total_commission_paid: number | string | null;
  total_commission_waived: number | string | null;
  balance: number | string | null;
}

function emptySummary(): ProviderFinancialSummary {
  return {
    totalCompleted: 0,
    totalRevenue: 0,
    totalOwed: 0,
    totalPaid: 0,
    totalWaived: 0,
    balance: 0,
  };
}

function aggregateBookings(bookings: Booking[]): ProviderFinancialSummary {
  let totalCompleted = 0;
  let totalRevenue = 0;
  let totalOwed = 0;
  let totalPaid = 0;
  let totalWaived = 0;
  for (const b of bookings) {
    if (b.status === "completed") {
      totalCompleted += 1;
      totalRevenue += b.price;
    }
    if (b.commissionStatus === "owed") totalOwed += b.commissionAmount;
    else if (b.commissionStatus === "paid") totalPaid += b.commissionAmount;
    else if (b.commissionStatus === "waived")
      totalWaived += b.commissionAmount;
  }
  return {
    totalCompleted,
    totalRevenue,
    totalOwed,
    totalPaid,
    totalWaived,
    balance: totalOwed,
  };
}

/** Admin overview: providers + their balance, sorted by balance desc. */
export async function adminFetchProvidersWithFinancials(
  lang: AppLang,
): Promise<ProviderWithFinancials[]> {
  const c = client();
  // Fetch providers (any status) and all bookings in parallel; aggregating
  // client-side keeps the SQL simple and avoids a per-provider RPC fan-out.
  const [providersRes, bookingsRes] = await Promise.all([
    c.from("providers").select(PROVIDER_SELECT),
    c
      .from("bookings")
      .select(BOOKING_SELECT)
      .order("created_at", { ascending: false }),
  ]);
  if (providersRes.error) throw providersRes.error;
  if (bookingsRes.error) throw bookingsRes.error;

  const providers = ((providersRes.data ?? []) as unknown as ProviderRow[]).map(
    (r) =>
      mapProvider(
        { ...r, services: (r.services ?? []).filter((s) => s.is_active !== false) },
        lang,
      ),
  );
  const bookings = ((bookingsRes.data ?? []) as unknown as BookingRow[]).map(
    (r) => mapBooking(r, lang),
  );

  // Group bookings by provider to compute aggregates.
  const byProvider = new Map<string, Booking[]>();
  for (const b of bookings) {
    const arr = byProvider.get(b.providerId);
    if (arr) arr.push(b);
    else byProvider.set(b.providerId, [b]);
  }

  const rows = providers.map((provider) => {
    const list = byProvider.get(provider.id) ?? [];
    const summary = aggregateBookings(list);
    return {
      provider,
      totalRevenue: summary.totalRevenue,
      totalOwed: summary.totalOwed,
      totalPaid: summary.totalPaid,
      totalWaived: summary.totalWaived,
      balance: summary.balance,
      completedCount: summary.totalCompleted,
    };
  });

  rows.sort((a, b) => b.balance - a.balance);
  return rows;
}

export interface ProviderStatement {
  bookings: Booking[];
  summary: ProviderFinancialSummary;
}

async function fetchProviderStatementInternal(
  providerId: string,
  lang: AppLang,
): Promise<ProviderStatement> {
  const c = client();
  // Pull all completed bookings (the statement focuses on settled work) +
  // ask the DB for authoritative aggregates so a slow client doesn't drift.
  const [bookingsRes, summaryRes] = await Promise.all([
    c
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("provider_id", providerId)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
    c.rpc("provider_financial_summary", { p_provider_id: providerId }),
  ]);
  if (bookingsRes.error) throw bookingsRes.error;
  if (summaryRes.error) throw summaryRes.error;

  const bookings = ((bookingsRes.data ?? []) as unknown as BookingRow[]).map(
    (r) => mapBooking(r, lang),
  );

  const rawRows = (summaryRes.data ?? []) as SummaryRow[];
  const raw = rawRows[0];
  const summary: ProviderFinancialSummary = raw
    ? {
        totalCompleted: Number(raw.total_completed ?? 0),
        totalRevenue: Number(raw.total_revenue ?? 0),
        totalOwed: Number(raw.total_commission_owed ?? 0),
        totalPaid: Number(raw.total_commission_paid ?? 0),
        totalWaived: Number(raw.total_commission_waived ?? 0),
        balance: Number(raw.balance ?? 0),
      }
    : emptySummary();

  return { bookings, summary };
}

export async function adminFetchProviderStatement(
  providerId: string,
  lang: AppLang,
): Promise<ProviderStatement> {
  return fetchProviderStatementInternal(providerId, lang);
}

/** Provider-self read-only view of own statement (RLS lets them through). */
export async function fetchOwnProviderStatement(
  providerId: string,
  lang: AppLang,
): Promise<ProviderStatement> {
  return fetchProviderStatementInternal(providerId, lang);
}

export async function adminSetCommissionStatus(
  bookingId: string,
  status: CommissionStatus,
  note?: string,
): Promise<void> {
  const { error } = await client().rpc("admin_set_commission_status", {
    p_booking_id: bookingId,
    p_status: status,
    p_note: note?.trim() ? note.trim() : null,
  });
  if (error) throw error;
}
