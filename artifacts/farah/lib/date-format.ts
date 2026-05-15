/**
 * Locale-aware date formatters.
 *
 * UI components should call these instead of inlining hardcoded
 * Arabic months/weekdays — the names are pulled from the active i18n
 * dictionary so English-language users see English names.
 */

import type { StringKey } from "@/locales/ar";

type Translator = (key: StringKey, vars?: Record<string, string | number>) => string;

const MONTH_KEYS = [
  "monthJan",
  "monthFeb",
  "monthMar",
  "monthApr",
  "monthMay",
  "monthJun",
  "monthJul",
  "monthAug",
  "monthSep",
  "monthOct",
  "monthNov",
  "monthDec",
] as const satisfies readonly StringKey[];

const WEEKDAY_KEYS = [
  "weekdaySun",
  "weekdayMon",
  "weekdayTue",
  "weekdayWed",
  "weekdayThu",
  "weekdayFri",
  "weekdaySat",
] as const satisfies readonly StringKey[];

/** "5 يناير 2026" / "Jan 5 2026" depending on locale. */
export function formatLongDate(d: Date, t: Translator, lang: string): string {
  const month = t(MONTH_KEYS[d.getMonth()]);
  const day = d.getDate();
  const year = d.getFullYear();
  if (lang === "en") {
    return `${month} ${day} ${year}`;
  }
  return `${day} ${month} ${year}`;
}

/** "5 يناير" / "Jan 5" — short variant without year. */
export function formatShortDate(d: Date, t: Translator, lang: string): string {
  const month = t(MONTH_KEYS[d.getMonth()]);
  const day = d.getDate();
  if (lang === "en") {
    return `${month} ${day}`;
  }
  return `${day} ${month}`;
}

/** "الأحد" / "Sun" */
export function formatWeekday(d: Date, t: Translator): string {
  return t(WEEKDAY_KEYS[d.getDay()]);
}

/**
 * Human-readable service duration. Single source of truth — derived from the
 * stored `duration_minutes` so the customer-facing label never disagrees with
 * the slot length used by the booking calendar.
 *
 * Examples:
 *   formatDurationMinutes(30, t, 'ar')  -> "30 دقيقة"
 *   formatDurationMinutes(60, t, 'ar')  -> "ساعة"
 *   formatDurationMinutes(90, t, 'ar')  -> "ساعة و 30 دقيقة"
 *   formatDurationMinutes(240, t, 'en') -> "4 hours"
 */
export function formatDurationMinutes(
  minutes: number,
  t: Translator,
  lang: string,
): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const isAr = lang !== "en";

  if (h === 0) {
    return isAr
      ? `${m} ${t("durationMinuteShort")}`
      : `${m} ${m === 1 ? t("durationMinuteOne") : t("durationMinutesPlural")}`;
  }
  if (m === 0) {
    if (h === 1) return t("durationOneHour");
    if (h === 2) return t("durationTwoHours");
    if (isAr && h >= 3 && h <= 10) return `${h} ${t("durationHoursFewAr")}`;
    if (isAr) return `${h} ${t("durationHourManyAr")}`;
    return `${h} ${t("durationHoursPlural")}`;
  }
  const hourPart =
    h === 1
      ? t("durationOneHour")
      : h === 2
        ? t("durationTwoHours")
        : isAr && h >= 3 && h <= 10
          ? `${h} ${t("durationHoursFewAr")}`
          : isAr
            ? `${h} ${t("durationHourManyAr")}`
            : `${h} ${t("durationHoursPlural")}`;
  const minPart = isAr
    ? `${m} ${t("durationMinuteShort")}`
    : `${m} ${m === 1 ? t("durationMinuteOne") : t("durationMinutesPlural")}`;
  return `${hourPart} ${t("durationAnd")} ${minPart}`;
}
