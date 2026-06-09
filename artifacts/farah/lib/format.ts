/**
 * Locale-aware date/time formatting helpers.
 *
 * Replaces the bilingual-only `formatTimeAr` from lib/data.ts. All UI that
 * renders booking times should call `formatTime(date, lang)` so language
 * switches at runtime are reflected without re-fetching.
 */

import type { AppLang } from "@/lib/i18n";

const AR_PERIOD = (h: number): string =>
  h < 5 || h >= 21 ? "ليلاً"
    : h < 12 ? "صباحاً"
    : h < 16 ? "ظهراً"
    : h < 18 ? "عصراً"
    : "مساءً";

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const AR_WEEKDAYS = [
  "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت",
];

const EN_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const EN_WEEKDAYS = [
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
];

export function formatTime(d: Date, lang: AppLang): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const mm = String(m).padStart(2, "0");
  if (lang === "en") {
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${mm} ${period}`;
  }
  const period = AR_PERIOD(h);
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${String(h12).padStart(2, "0")}:${mm}`;
}

export function formatTimeRange(start: Date, end: Date, lang: AppLang): string {
  const dash = lang === "en" ? " – " : " – ";
  return `${formatTime(start, lang)}${dash}${formatTime(end, lang)}`;
}

/** Compact "09:00 AM" / "09:00 ص" form — no period word. Used in dense
 *  pickers where space matters more than precise time-of-day naming. */
export function formatTimeCompact(d: Date, lang: AppLang): string {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const hh = String(h12).padStart(2, "0");
  const suffix = lang === "en" ? (h >= 12 ? "PM" : "AM") : h >= 12 ? "م" : "ص";
  return `${hh}:${mm} ${suffix}`;
}

export function formatDate(d: Date, lang: AppLang): string {
  const day = d.getDate();
  const month = lang === "en" ? EN_MONTHS[d.getMonth()] : AR_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const weekday = lang === "en" ? EN_WEEKDAYS[d.getDay()] : AR_WEEKDAYS[d.getDay()];
  return lang === "en"
    ? `${weekday}, ${month} ${day}, ${year}`
    : `${weekday} ${day} ${month} ${year}`;
}

/** ISO yyyy-mm-dd — used as a stable booking.date snapshot for back-compat. */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
