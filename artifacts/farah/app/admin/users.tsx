import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Stars } from "@/components/ui/Stars";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

export default function UsersScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { providers, bookings } = useApp();
  const [tab, setTab] = useState<"providers" | "customers">("providers");

  const customers = Array.from(
    new Map(
      bookings.map((b) => [b.userPhone, { name: b.userName, phone: b.userPhone }]),
    ).values(),
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="إدارة المستخدمين" />
      <View style={[styles.tabsBar, { borderBottomColor: c.border }]}>
        <TabBtn
          label={`مزودو الخدمة (${providers.length})`}
          active={tab === "providers"}
          onPress={() => setTab("providers")}
        />
        <TabBtn
          label={`العملاء (${customers.length})`}
          active={tab === "customers"}
          onPress={() => setTab("customers")}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 30,
          gap: 10,
        }}
      >
        {tab === "providers"
          ? providers.map((p) => (
              <Card key={p.id}>
                <View style={styles.row}>
                  <View
                    style={[styles.avatar, { backgroundColor: c.primaryBg }]}
                  >
                    <Feather name="briefcase" size={20} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: c.foreground }]}>
                      {p.name}
                    </Text>
                    <View style={styles.metaRow}>
                      <Feather name="map-pin" size={11} color={c.mutedForeground} />
                      <Text
                        style={[styles.meta, { color: c.mutedForeground }]}
                      >
                        {p.city}
                      </Text>
                      <View style={[styles.dot, { backgroundColor: c.mutedForeground }]} />
                      <Stars value={p.rating} size={11} />
                      <Text
                        style={[styles.meta, { color: c.mutedForeground }]}
                      >
                        ({p.reviews})
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[styles.statusPill, { backgroundColor: "#dcfce7" }]}
                  >
                    <Text style={[styles.statusText, { color: "#166534" }]}>
                      نشط
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          : customers.length === 0
            ? (
              <Text style={[styles.emptyText, { color: c.mutedForeground }]}>
                لا يوجد عملاء قاموا بحجوزات حتى الآن
              </Text>
            )
            : customers.map((u) => (
                <Card key={u.phone}>
                  <View style={styles.row}>
                    <View
                      style={[styles.avatar, { backgroundColor: c.primaryBg }]}
                    >
                      <Feather name="user" size={20} color={c.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: c.foreground }]}>
                        {u.name}
                      </Text>
                      <Text style={[styles.meta, { color: c.mutedForeground }]}>
                        {u.phone}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))}
      </ScrollView>
    </View>
  );
}

function TabBtn({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabBtn,
        {
          borderBottomColor: active ? c.primary : "transparent",
        },
      ]}
    >
      <Text
        style={[
          styles.tabText,
          {
            color: active ? c.primary : c.mutedForeground,
            fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabsBar: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 2,
  },
  tabText: { fontSize: 13 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: "Inter_700Bold", fontSize: 14, textAlign: "right" },
  metaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  meta: { fontFamily: "Inter_400Regular", fontSize: 11 },
  dot: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 4 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  emptyText: {
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
  },
});
