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
 * Searchable single-select city picker. Replaces the chip strip we had
 * for cities — works for the booking form (single value) and any other
 * screen that needs the customer to pick a known city.
 *
 * `value` is the canonical Arabic name (we store cities in DB as their
 * Arabic string, regardless of UI language). The display label is
 * localized via `localizedCityName`.
 */
export function CityPicker({
  value,
  onChange,
  label,
  placeholder,
  cities = CITIES,
}: {
  value: string;
  onChange: (city: string) => void;
  label?: string;
  placeholder?: string;
  cities?: string[];
}) {
  const c = useColors();
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter((city) => {
      const en = localizedCityName(city, "en").toLowerCase();
      return city.toLowerCase().includes(q) || en.includes(q);
    });
  }, [cities, search]);

  const displayLabel = value
    ? localizedCityName(value, lang)
    : placeholder ?? t("pickCity");

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
              color: value ? c.foreground : c.mutedForeground,
              fontFamily: value ? "Cairo_600SemiBold" : "Cairo_400Regular",
            },
          ]}
          numberOfLines={1}
        >
          {displayLabel}
        </Text>
        <Feather name="chevron-down" size={16} color={c.mutedForeground} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.sheet,
              { backgroundColor: c.background, borderRadius: c.radius },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: c.foreground }]}>
                {t("pickCity")}
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
                  { color: c.foreground, textAlign: lang === "en" ? "left" : "right" },
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
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.length === 0 ? (
                <Text
                  style={[styles.emptyText, { color: c.mutedForeground }]}
                >
                  {t("homeNoSearchResults")}
                </Text>
              ) : (
                filtered.map((city) => {
                  const active = city === value;
                  return (
                    <Pressable
                      key={city}
                      onPress={() => {
                        onChange(city);
                        setOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.option,
                        {
                          backgroundColor: active
                            ? c.primaryBg
                            : pressed
                              ? c.muted
                              : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          {
                            color: active ? c.primary : c.foreground,
                            fontFamily: active
                              ? "Cairo_700Bold"
                              : "Cairo_500Medium",
                          },
                        ]}
                      >
                        {localizedCityName(city, lang)}
                      </Text>
                      {active ? (
                        <Feather name="check" size={18} color={c.primary} />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
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
  fieldText: { flex: 1, fontSize: 14, textAlign: "right" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
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
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
  },
  optionText: { fontSize: 14, textAlign: "right" },
  emptyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
});
