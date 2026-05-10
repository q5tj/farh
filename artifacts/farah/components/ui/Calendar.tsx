import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

interface CalendarProps {
  /** Selected day as ISO yyyy-mm-dd, or null. */
  value: string | null;
  onChange: (iso: string) => void;
  /** ISO yyyy-mm-dd strings that are eligible to pick. Days outside this
   *  set render as disabled/muted (e.g. past days, days the provider
   *  doesn't work). When omitted every non-past day is enabled. */
  availableDays?: Set<string>;
  /** Hard-disable selection — for read-only contexts. */
  readOnly?: boolean;
}

const WEEKDAY_KEYS = [
  "weekdaySun",
  "weekdayMon",
  "weekdayTue",
  "weekdayWed",
  "weekdayThu",
  "weekdayFri",
  "weekdaySat",
] as const;

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
] as const;

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Month-grid calendar — visually similar to the OS native picker but
 * styled to match the app palette. Renders 6 rows × 7 columns starting
 * on Sunday, with leading/trailing days from neighbouring months muted.
 *
 * Selection behaviour:
 *   - Tapping a day in `availableDays` calls `onChange(iso)`.
 *   - "Today" jumps the visible month back to today and selects today
 *     (if it's available).
 *   - "Clear" resets the selection to empty.
 *   - Up / Down arrows shift the visible month by ±1.
 */
export function Calendar({
  value,
  onChange,
  availableDays,
  readOnly,
}: CalendarProps) {
  const c = useColors();
  const { t } = useT();

  // The month currently shown — defaults to selected day's month, else
  // today's month.
  const [view, setView] = useState<Date>(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return new Date(y, (m ?? 1) - 1, 1);
    }
    return startOfMonth(new Date());
  });

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  // Build the 42 cells (6 weeks) starting on Sunday.
  const cells = useMemo(() => {
    const first = startOfMonth(view);
    const startWeekday = first.getDay(); // 0=Sun
    const start = new Date(first);
    start.setDate(first.getDate() - startWeekday);
    const arr: { date: Date; iso: string; outside: boolean }[] = [];
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push({
        date: d,
        iso: toIso(d),
        outside: d.getMonth() !== view.getMonth(),
      });
    }
    return arr;
  }, [view]);

  const monthLabel = `${t(MONTH_KEYS[view.getMonth()])} ${view.getFullYear()}`;

  const goPrev = () => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1));
  const goNext = () => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1));
  const goToday = () => {
    setView(startOfMonth(today));
    const iso = toIso(today);
    if (!readOnly && (!availableDays || availableDays.has(iso))) {
      onChange(iso);
    }
  };
  const clear = () => {
    if (readOnly) return;
    onChange("");
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderRadius: c.radius,
        },
      ]}
    >
      {/* Header — month label on the left, prev/next chevrons on the right */}
      <View style={styles.header}>
        <Text style={[styles.monthLabel, { color: c.foreground }]}>
          {monthLabel}
        </Text>
        <View style={styles.navBtns}>
          <Pressable
            onPress={goPrev}
            hitSlop={8}
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: pressed ? c.muted : "transparent" },
            ]}
          >
            <Feather name="arrow-up" size={16} color={c.foreground} />
          </Pressable>
          <Pressable
            onPress={goNext}
            hitSlop={8}
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: pressed ? c.muted : "transparent" },
            ]}
          >
            <Feather name="arrow-down" size={16} color={c.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Weekday header row */}
      <View style={styles.weekHeader}>
        {WEEKDAY_KEYS.map((k) => (
          <Text
            key={k}
            style={[styles.weekHeaderText, { color: c.mutedForeground }]}
          >
            {t(k).slice(0, 2)}
          </Text>
        ))}
      </View>

      {/* 6×7 day grid */}
      <View style={styles.grid}>
        {cells.map(({ date, iso, outside }) => {
          const isToday = isSameDay(date, today);
          const isSelected = value === iso;
          const isPast = date < today;
          const inAvailable = availableDays ? availableDays.has(iso) : !isPast;
          const isWeekendSat = date.getDay() === 6;
          const isWeekendFri = date.getDay() === 5;
          const disabled = readOnly || !inAvailable;

          let textColor = c.foreground;
          if (outside) textColor = c.mutedForeground + "70";
          else if (disabled) textColor = c.mutedForeground;
          else if (isWeekendSat || isWeekendFri) textColor = "#ef4444";

          return (
            <Pressable
              key={iso}
              onPress={() => {
                if (!disabled) onChange(iso);
              }}
              disabled={disabled}
              style={({ pressed }) => [
                styles.cell,
                {
                  backgroundColor: isSelected
                    ? c.primary
                    : pressed && !disabled
                      ? c.muted
                      : "transparent",
                  borderRadius: 999,
                },
              ]}
            >
              <Text
                style={[
                  styles.cellText,
                  {
                    color: isSelected ? "#ffffff" : textColor,
                    fontFamily: isToday || isSelected
                      ? "Cairo_700Bold"
                      : "Cairo_500Medium",
                  },
                ]}
              >
                {date.getDate()}
              </Text>
              {isToday && !isSelected ? (
                <View
                  style={[styles.todayDot, { backgroundColor: c.primary }]}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Footer — Clear / Today */}
      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <Pressable onPress={clear} hitSlop={8} style={styles.footerBtn}>
          <Text style={[styles.footerText, { color: c.primary }]}>
            {t("calendarClear")}
          </Text>
        </Pressable>
        <Pressable onPress={goToday} hitSlop={8} style={styles.footerBtn}>
          <Text style={[styles.footerText, { color: c.primary }]}>
            {t("calendarToday")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    padding: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  monthLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
  },
  navBtns: {
    flexDirection: "row",
    gap: 4,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  weekHeader: {
    flexDirection: "row",
    paddingVertical: 6,
  },
  weekHeaderText: {
    flex: 1,
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  cellText: {
    fontSize: 14,
  },
  todayDot: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 8,
  },
  footerBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  footerText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
  },
});
