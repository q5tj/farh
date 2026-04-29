import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  updateProviderWorkingHours,
  type Weekday,
  type WorkingHours,
} from "@/lib/data";
import { useT } from "@/lib/i18n";

const ORDER: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

type Period = "AM" | "PM";

/** Parse "HH:MM" (24-hour DB value) to display "h:mm" + period. */
function parse24(time24: string): { display: string; period: Period } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!m) return { display: "12:00", period: "PM" };
  const h = Number(m[1]);
  const min = m[2];
  const period: Period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { display: `${h12}:${min}`, period };
}

/** Combine "h:mm" + period into 24-hour "HH:MM". Returns null if invalid. */
function to24(display: string, period: Period): string | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(display);
  if (!m) return null;
  const h12 = Number(m[1]);
  const min = Number(m[2]);
  if (h12 < 1 || h12 > 12 || min < 0 || min > 59) return null;
  let h24 = h12 % 12; // 12 -> 0
  if (period === "PM") h24 += 12;
  return `${String(h24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Inline input for a single time value. Accepts "h:mm" + AM/PM toggle. */
function TimeField({
  value,
  onChange,
}: {
  value: string; // 24-hour "HH:MM"
  onChange: (v: string) => void;
}) {
  const c = useColors();
  const parsed = useMemo(() => parse24(value), [value]);
  const [draft, setDraft] = useState(parsed.display);

  // Sync local draft when external value changes
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
    <View style={{ gap: 6 }}>
      <View style={styles.fieldRow}>
        <TextInput
          value={draft}
          onChangeText={commitDisplay}
          placeholder="9:00"
          placeholderTextColor={c.mutedForeground}
          style={[
            styles.timeInput,
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
              parsed.period === "AM" && {
                backgroundColor: c.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.periodText,
                {
                  color: parsed.period === "AM" ? "#ffffff" : c.foreground,
                },
              ]}
            >
              ص
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPeriod("PM")}
            style={[
              styles.periodOption,
              parsed.period === "PM" && {
                backgroundColor: c.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.periodText,
                {
                  color: parsed.period === "PM" ? "#ffffff" : c.foreground,
                },
              ]}
            >
              م
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function AvailabilityScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { width } = useWindowDimensions();
  // Stack من / إلى vertically on narrow phones; side-by-side on wider screens.
  const stacked = width < 480;
  const { profile } = useAuth();
  const { getProvider, refresh } = useApp();
  const provider = profile?.providerId ? getProvider(profile.providerId) : null;

  const DAY_LABELS: Record<Weekday, string> = {
    sun: t("daySunday"),
    mon: t("dayMonday"),
    tue: t("dayTuesday"),
    wed: t("dayWednesday"),
    thu: t("dayThursday"),
    fri: t("dayFriday"),
    sat: t("daySaturday"),
  };

  const initial = useMemo<WorkingHours>(
    () =>
      provider?.workingHours ?? {
        sun: ["09:00", "22:00"],
        mon: ["09:00", "22:00"],
        tue: ["09:00", "22:00"],
        wed: ["09:00", "22:00"],
        thu: ["09:00", "22:00"],
        fri: ["13:00", "23:00"],
        sat: ["09:00", "22:00"],
      },
    [provider?.workingHours],
  );

  const [hours, setHours] = useState<WorkingHours>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    setHours(initial);
  }, [initial]);

  const setDay = (day: Weekday, value: [string, string] | null) => {
    setHours((prev) => ({ ...prev, [day]: value }));
  };

  const save = async () => {
    if (!provider) return;
    // Validate (now in 24-hour internal format)
    for (const day of ORDER) {
      const v = hours[day];
      if (!v) continue;
      const valid =
        /^([01]\d|2[0-3]):[0-5]\d$/.test(v[0]) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(v[1]);
      if (!valid) {
        const msg = t("saveTimeFormatErr", { day: DAY_LABELS[day] });
        if (Platform.OS === "web") {
          if (typeof window !== "undefined") window.alert(msg);
        } else {
          Alert.alert(t("error"), msg);
        }
        return;
      }
    }
    setSaving(true);
    try {
      await updateProviderWorkingHours(provider.id, hours);
      await refresh();
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(0), 2000);
    } catch (e) {
      const msg = (e as Error).message ?? t("contentSaveFailed");
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(msg);
      } else {
        Alert.alert(t("error"), msg);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!provider) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader
        title={t("workingHoursTitle")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/provider-zone");
        }}
      />
        <View style={{ padding: 24 }}>
          <Text style={{ color: c.foreground, textAlign: "right" }}>
            {t("createProviderFirst")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("workingHoursTitle")}
        subtitle={provider.name}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/provider-zone");
        }}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 90,
          gap: 10,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={40}
      >
        <Text style={[styles.hint, { color: c.mutedForeground }]}>
          {t("workingHoursHint")}
        </Text>

        {ORDER.map((day) => {
          const value = hours[day];
          const open = value !== null;
          return (
            <Card key={day}>
              <View style={styles.row}>
                <Text style={[styles.dayLabel, { color: c.foreground }]}>
                  {DAY_LABELS[day]}
                </Text>
                <Pressable
                  onPress={() =>
                    setDay(day, open ? null : ["09:00", "22:00"])
                  }
                  style={[
                    styles.toggle,
                    {
                      backgroundColor: open ? c.primary : c.muted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      { color: open ? "#ffffff" : c.foreground },
                    ]}
                  >
                    {open ? t("dayOpen") : t("dayClosed")}
                  </Text>
                </Pressable>
              </View>
              {value ? (
                <View
                  style={[
                    styles.timesRow,
                    stacked && styles.timesRowStacked,
                  ]}
                >
                  <View style={{ flex: 1, width: "100%" }}>
                    <Text
                      style={[styles.timeLabel, { color: c.mutedForeground }]}
                    >
                      {t("fromTime")}
                    </Text>
                    <TimeField
                      value={value[0]}
                      onChange={(v) => setDay(day, [v, value[1]])}
                    />
                  </View>
                  <View style={{ flex: 1, width: "100%" }}>
                    <Text
                      style={[styles.timeLabel, { color: c.mutedForeground }]}
                    >
                      {t("toTime")}
                    </Text>
                    <TimeField
                      value={value[1]}
                      onChange={(v) => setDay(day, [value[0], v])}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}

        <View style={{ marginTop: 14 }}>
          <Button
            label={savedAt ? t("savedCheck") : t("saveChanges")}
            onPress={save}
            loading={saving}
            variant={savedAt ? "secondary" : "primary"}
            size="lg"
          />
        </View>
        <View>
          <Button
            label={t("back")}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/provider-zone");
            }}
            variant="ghost"
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayLabel: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  toggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
  },
  toggleText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  timesRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  timesRowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
  },
  timeLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    textAlign: "right",
    marginBottom: 6,
  },
  fieldRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    textAlign: "center",
  },
  periodWrap: {
    flexDirection: "row-reverse",
    borderRadius: 8,
    padding: 2,
  },
  periodOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 28,
    alignItems: "center",
  },
  periodText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
  },
});
