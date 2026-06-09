import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/useColors";

/**
 * 12-hour clock input with an AM/PM toggle. The displayed string is
 * "h:mm" but the value passed in/out is canonical 24-hour "HH:MM" so
 * the DB / RPC layer never has to disambiguate. Used by:
 *   • provider-zone/availability  — weekly working hours editor
 *   • provider-zone/unavailable   — ad-hoc blocked-window form
 *
 * Why 12-hour: customers and providers in Saudi Arabia read clocks in
 * 12-hour form; forcing 24-hour input made them type "18:00" for 6pm.
 */

export type Period = "AM" | "PM";

/** Parse "HH:MM" (24h) → display "h:mm" + AM/PM. */
export function parse24(time24: string): { display: string; period: Period } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!m) return { display: "12:00", period: "PM" };
  const h = Number(m[1]);
  const min = m[2];
  const period: Period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { display: `${h12}:${min}`, period };
}

/** Combine "h:mm" + period → canonical 24-hour "HH:MM". */
export function to24(display: string, period: Period): string | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(display);
  if (!m) return null;
  const h12 = Number(m[1]);
  const min = Number(m[2]);
  if (h12 < 1 || h12 > 12 || min < 0 || min > 59) return null;
  let h24 = h12 % 12; // 12 → 0
  if (period === "PM") h24 += 12;
  return `${String(h24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

interface Props {
  /** Canonical 24-hour "HH:MM" value. */
  value: string;
  onChange: (next: string) => void;
}

export function TimeField({ value, onChange }: Props) {
  const c = useColors();
  const parsed = useMemo(() => parse24(value), [value]);
  const [draft, setDraft] = useState(parsed.display);

  useEffect(() => {
    setDraft(parsed.display);
  }, [parsed.display]);

  const commitDisplay = (next: string) => {
    setDraft(next);
    const v24 = to24(next, parsed.period);
    if (v24) onChange(v24);
  };

  const setPeriod = (p: Period) => {
    const v24 = to24(draft, p);
    if (v24) onChange(v24);
  };

  return (
    <View style={styles.row}>
      <TextInput
        value={draft}
        onChangeText={commitDisplay}
        placeholder="9:00"
        placeholderTextColor={c.mutedForeground}
        style={[
          styles.input,
          {
            color: c.foreground,
            borderColor: c.border,
            borderRadius: c.radius - 4,
            backgroundColor: c.background,
          },
        ]}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
      <View style={[styles.periodWrap, { backgroundColor: c.muted }]}>
        <Pressable
          onPress={() => setPeriod("AM")}
          style={[
            styles.periodOption,
            parsed.period === "AM" && { backgroundColor: c.primary },
          ]}
        >
          <Text
            style={[
              styles.periodText,
              { color: parsed.period === "AM" ? "#ffffff" : c.foreground },
            ]}
          >
            ص
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setPeriod("PM")}
          style={[
            styles.periodOption,
            parsed.period === "PM" && { backgroundColor: c.primary },
          ]}
        >
          <Text
            style={[
              styles.periodText,
              { color: parsed.period === "PM" ? "#ffffff" : c.foreground },
            ]}
          >
            م
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    textAlign: "center",
    minWidth: 90,
  },
  periodWrap: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    padding: 2,
  },
  periodOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 36,
    alignItems: "center",
  },
  periodText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
  },
});
