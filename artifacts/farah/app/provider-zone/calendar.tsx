import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  fetchProviderBookings,
  fetchProviderByOwner,
  type Booking,
} from "@/lib/data";
import { formatDate, formatTimeCompact } from "@/lib/format";
import { useT } from "@/lib/i18n";

/**
 * Provider calendar — month grid coloured by the number of bookings on
 * each day. Tap a day → modal listing the bookings for that day → tap
 * one → /booking/[id] for the full customer details.
 *
 * Reuses provider_bookings from the existing data layer (no DB changes);
 * the heat-mapping is purely client side.
 */

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_AR = [
  "يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];
const MONTHS_EN = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

function isoOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ProviderCalendarScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t, lang } = useT();
  const { profile } = useAuth();

  const [view, setView] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [openIso, setOpenIso] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    (async () => {
      try {
        const p = await fetchProviderByOwner(profile.id, lang);
        if (!alive || !p) return;
        const list = await fetchProviderBookings(p.id, lang);
        if (alive) setBookings(list);
      } catch (e) {
        console.warn("[calendar] load failed", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profile?.id, lang]);

  // Index bookings by ISO yyyy-mm-dd so the day grid can colour cells
  // and the day modal can pull them in O(1).
  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const iso = isoOf(new Date(b.startAt));
      const arr = m.get(iso);
      if (arr) arr.push(b);
      else m.set(iso, [b]);
    }
    return m;
  }, [bookings]);

  // 6x7 day grid for the visible month.
  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startWeekday = first.getDay();
    const start = new Date(first);
    start.setDate(first.getDate() - startWeekday);
    const arr: { date: Date; iso: string; outside: boolean }[] = [];
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push({
        date: d,
        iso: isoOf(d),
        outside: d.getMonth() !== view.getMonth(),
      });
    }
    return arr;
  }, [view]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const goPrev = () => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1));
  const goNext = () => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1));

  const monthLabel =
    lang === "en"
      ? `${MONTHS_EN[view.getMonth()]} ${view.getFullYear()}`
      : `${MONTHS_AR[view.getMonth()]} ${view.getFullYear()}`;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title={t("providerCalendar")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      </View>
    );
  }

  const openDayBookings = openIso ? byDay.get(openIso) ?? [] : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("providerCalendar")} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      >
        <Card>
          <View style={styles.header}>
            <Pressable onPress={goPrev} hitSlop={10} style={styles.navBtn}>
              <Feather name="chevron-right" size={18} color={c.foreground} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: c.foreground }]}>
              {monthLabel}
            </Text>
            <Pressable onPress={goNext} hitSlop={10} style={styles.navBtn}>
              <Feather name="chevron-left" size={18} color={c.foreground} />
            </Pressable>
          </View>

          <View style={styles.weekHeader}>
            {(lang === "en" ? WEEKDAYS_EN : WEEKDAYS_AR).map((w) => (
              <Text
                key={w}
                style={[styles.weekHeaderText, { color: c.mutedForeground }]}
              >
                {w.slice(0, 2)}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map(({ date, iso, outside }) => {
              const count = byDay.get(iso)?.length ?? 0;
              const isToday = isoOf(today) === iso;
              const intensity =
                count === 0 ? 0 : count === 1 ? 0.25 : count === 2 ? 0.45 : 0.7;
              return (
                <Pressable
                  key={iso}
                  onPress={() => count > 0 && setOpenIso(iso)}
                  disabled={count === 0}
                  style={({ pressed }) => [
                    styles.cell,
                    {
                      backgroundColor:
                        count > 0
                          ? `rgba(123,44,191,${intensity})`
                          : pressed
                            ? c.muted
                            : "transparent",
                      borderColor: isToday ? c.primary : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.cellNum,
                      {
                        color: outside
                          ? c.mutedForeground + "80"
                          : count > 0
                            ? "#ffffff"
                            : c.foreground,
                        fontFamily: isToday ? "Cairo_700Bold" : "Cairo_500Medium",
                      },
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {count > 0 ? (
                    <Text style={styles.cellCount}>{count}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Card>

        <View style={{ marginTop: 14, gap: 6 }}>
          <Text style={[styles.legendTitle, { color: c.mutedForeground }]}>
            {t("calendarLegend")}
          </Text>
          <View style={styles.legendRow}>
            <LegendDot color="rgba(123,44,191,0.25)" />
            <Text style={[styles.legendText, { color: c.foreground }]}>
              {t("calendarLegendOne")}
            </Text>
          </View>
          <View style={styles.legendRow}>
            <LegendDot color="rgba(123,44,191,0.7)" />
            <Text style={[styles.legendText, { color: c.foreground }]}>
              {t("calendarLegendMany")}
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={!!openIso}
        transparent
        animationType="slide"
        onRequestClose={() => setOpenIso(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: c.background, paddingBottom: insets.bottom + 12 },
            ]}
          >
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: c.foreground }]}>
                {openIso
                  ? formatDate(parseIso(openIso), lang as "ar" | "en")
                  : ""}
              </Text>
              <Pressable onPress={() => setOpenIso(null)} hitSlop={8}>
                <Feather name="x" size={20} color={c.foreground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
              {openDayBookings.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    setOpenIso(null);
                    router.push(`/booking/${b.id}`);
                  }}
                >
                  <Card>
                    <View style={styles.bookingRow}>
                      <View
                        style={[
                          styles.bookingIcon,
                          { backgroundColor: c.primaryBg },
                        ]}
                      >
                        <Feather name="user" size={16} color={c.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.bookingTitle, { color: c.foreground }]}>
                          {b.serviceTitle}
                        </Text>
                        <Text style={[styles.bookingTime, { color: c.mutedForeground }]}>
                          {formatTimeCompact(new Date(b.startAt), lang as "ar" | "en")}
                          {"  –  "}
                          {formatTimeCompact(new Date(b.endAt), lang as "ar" | "en")}
                        </Text>
                        <Text style={[styles.bookingMeta, { color: c.mutedForeground }]}>
                          {b.userName || t("anonymousUser")}
                        </Text>
                      </View>
                      <Feather name="chevron-left" size={18} color={c.mutedForeground} />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function LegendDot({ color }: { color: string }) {
  return <View style={[styles.legendDot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  monthLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    position: "relative",
  },
  cellNum: { fontSize: 13 },
  cellCount: {
    position: "absolute",
    bottom: 4,
    color: "#ffffff",
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
  },
  legendTitle: { fontFamily: "Cairo_700Bold", fontSize: 12, textAlign: "right" },
  legendRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  legendDot: { width: 14, height: 14, borderRadius: 7 },
  legendText: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
  },
  modalHead: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
  },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  bookingRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  bookingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  bookingTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  bookingTime: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  bookingMeta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 2,
    textAlign: "right",
  },
});
