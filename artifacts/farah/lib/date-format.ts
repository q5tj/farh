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
