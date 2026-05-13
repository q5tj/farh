import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { CITIES, localizedCityName } from "@/constants/seedData";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

/**
 * Multi-select city picker used by the provider's "service areas"
 * step in onboarding (and the standalone service-areas screen).
 *
 * Why not flexwrap chips: the city list grew to 50+ cities once we
 * extended CITIES, which made the chip grid unscrollable and hard to
 * navigate. The picker is a sheet with search and tick-marks; the
 * compact "summary" stays on the form between opens.
 */
export function MultiCityPicker({
  values,
  onChange,
  label,
  primaryCity,
  cities = CITIES,
}: {
  values: string[];
  onChange: (cities: string[]) => void;
  label?: string;
  /** If set, this city is locked in (the provider's main city) and
   *  rendered with a "primary" badge — it can't be removed. */
  primaryCity?: string;
  cities?: string[];
}) {
  const c = useColors();
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSet = useMemo(() => new Set(values), [values]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter((city) => {
      const en = localizedCityName(city, "en").toLowerCase();
      return city.toLowerCase().includes(q) || en.includes(q);
    });
  }, [cities, search]);

  const toggle = (city: string) => {
    if (city === primaryCity) return; // locked
    const next = new Set(values);
    if (next.has(city)) next.delete(city);
    else next.add(city);
    onChange(Array.from(next));
  };

  const summary =
    values.length === 0
      ? t("pickAtLeastOneCity")
      : values
          .slice(0, 4)
          .map((v) => localizedCityName(v, lang))
          .join("، ") + (values.length > 4 ? ` +${values.length - 4}` : "");

  return (
    <View>
      {label ? (
        <Text style={[styles.fieldLabel, { color: c.foreground }]}>{label}</Text>
      ) : null}
      <Pressable
        onPress={() => {
          setSearch("");
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.field,
          {
            borderColor: c.border,
            backgroundColor: c.card,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Feather name="map-pin" size={16} color={c.mutedForeground} />
        <Text
          style={[
            styles.fieldText,
            {
              color: values.length ? c.foreground : c.mutedForeground,
              fontFamily: values.length
                ? "Cairo_600SemiBold"
                : "Cairo_400Regular",
            },
          ]}
          numberOfLines={2}
        >
          {summary}
        </Text>
        <Feather name="chevron-down" size={16} color={c.mutedForeground} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.sheet,
              { backgroundColor: c.background, borderRadius: c.radius },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: c.foreground }]}>
                {label ?? t("serviceAreasTitle")}
              </Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={8}
                style={styles.closeBtn}
              >
                <Feather name="x" size={20} color={c.mutedForeground} />
              </Pressable>
            </View>

            <View
              style={[
                styles.searchWrap,
                { backgroundColor: c.muted, borderColor: c.border },
              ]}
            >
              <Feather name="search" size={16} color={c.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("searchCities")}
                placeholderTextColor={c.mutedForeground}
                style={[
                  styles.searchInput,
                  {
                    color: c.foreground,
                    textAlign: lang === "en" ? "left" : "right",
                  },
                ]}
                autoFocus
              />
              {search ? (
                <Pressable onPress={() => setSearch("")} hitSlop={6}>
                  <Feather name="x-circle" size={16} color={c.mutedForeground} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 12 }}
            >
              {filtered.length === 0 ? (
                <Text style={[styles.emptyText, { color: c.mutedForeground }]}>
                  {t("homeNoSearchResults")}
                </Text>
              ) : (
                filtered.map((city) => {
                  const checked = selectedSet.has(city);
                  const isPrimary = city === primaryCity;
                  return (
                    <Pressable
                      key={city}
                      onPress={() => toggle(city)}
                      style={({ pressed }) => [
                        styles.option,
                        {
                          backgroundColor:
                            checked || isPrimary
                              ? c.primaryBg
                              : pressed
                                ? c.muted
                                : "transparent",
                          opacity: isPrimary ? 0.85 : 1,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor:
                              checked || isPrimary ? c.primary : c.border,
                            backgroundColor:
                              checked || isPrimary ? c.primary : "transparent",
                          },
                        ]}
                      >
                        {checked || isPrimary ? (
                          <Feather name="check" size={12} color="#ffffff" />
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.optionText,
                          {
                            color: c.foreground,
                            fontFamily:
                              checked || isPrimary
                                ? "Cairo_700Bold"
                                : "Cairo_500Medium",
                          },
                        ]}
                      >
                        {localizedCityName(city, lang)}
                      </Text>
                      {isPrimary ? (
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: c.primary },
                          ]}
                        >
                          <Text style={styles.badgeText}>
                            {t("primaryCityBadge")}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <Pressable
              onPress={() => setOpen(false)}
              style={[
                styles.doneBtn,
                { backgroundColor: c.primary },
              ]}
            >
              <Text style={styles.doneBtnText}>
                {t("done")} ({values.length})
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "right",
  },
  field: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  fieldText: { flex: 1, fontSize: 13, textAlign: "right" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "82%",
  },
  sheetHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  closeBtn: { padding: 4 },
  searchWrap: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
    marginVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cairo_500Medium",
    padding: 0,
  },
  option: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
  },
  optionText: { flex: 1, fontSize: 14, textAlign: "right" },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  badgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    color: "#ffffff",
  },
  emptyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
  doneBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  doneBtnText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#ffffff",
  },
});
