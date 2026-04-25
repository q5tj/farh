import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { STRINGS } from "@/constants/strings";
import { Booking, BookingStatus, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const FILTERS: { id: "all" | BookingStatus; label: string }[] = [
  { id: "pending", label: STRINGS.statusPending },
  { id: "accepted", label: STRINGS.statusAccepted },
  { id: "completed", label: STRINGS.statusCompleted },
  { id: "all", label: "الكل" },
];

export default function RequestsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { bookings, updateBookingStatus } = useApp();
  const providerId = user?.providerId ?? "p1";
  const [filter, setFilter] = useState<"all" | BookingStatus>("pending");

  const filtered = useMemo(() => {
    const mine = bookings.filter((b) => b.providerId === providerId);
    if (filter === "all") return mine;
    return mine.filter((b) => b.status === filter);
  }, [bookings, providerId, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={STRINGS.incomingRequests} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 60 }}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? c.primary : c.muted,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#ffffff" : c.foreground },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="لا توجد طلبات في هذا التصنيف"
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 12,
          }}
        >
          {filtered.map((b) => (
            <RequestCard
              key={b.id}
              booking={b}
              onChange={(s) => updateBookingStatus(b.id, s)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function RequestCard({
  booking,
  onChange,
}: {
  booking: Booking;
  onChange: (s: BookingStatus) => void;
}) {
  const c = useColors();
  return (
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.client, { color: c.foreground }]}>
            {booking.userName}
          </Text>
          <Text style={[styles.phone, { color: c.mutedForeground }]}>
            {booking.userPhone}
          </Text>
        </View>
        <StatusBadge status={booking.status} />
      </View>

      <Text style={[styles.service, { color: c.foreground }]}>
        {booking.serviceTitle}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Feather name="calendar" size={12} color={c.mutedForeground} />
          <Text style={[styles.meta, { color: c.mutedForeground }]}>
            {booking.date} • {booking.time}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Feather name="map-pin" size={12} color={c.mutedForeground} />
          <Text
            style={[styles.meta, { color: c.mutedForeground }]}
            numberOfLines={1}
          >
            {booking.location}
          </Text>
        </View>
      </View>

      {booking.notes ? (
        <View style={[styles.notesBox, { backgroundColor: c.muted }]}>
          <Text style={[styles.notesText, { color: c.mutedForeground }]}>
            {booking.notes}
          </Text>
        </View>
      ) : null}

      <View style={styles.priceRow}>
        <Text style={[styles.priceLabel, { color: c.mutedForeground }]}>
          المبلغ
        </Text>
        <Text style={[styles.price, { color: c.primary }]}>
          {booking.price.toLocaleString()} ر.س
        </Text>
      </View>

      {booking.status === "pending" ? (
        <View style={styles.actionsRow}>
          <View style={{ flex: 1 }}>
            <Button label={STRINGS.acceptRequest} onPress={() => onChange("accepted")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={STRINGS.rejectRequest}
              variant="ghost"
              onPress={() => onChange("rejected")}
            />
          </View>
        </View>
      ) : booking.status === "accepted" ? (
        <View style={{ marginTop: 14 }}>
          <Button
            label={STRINGS.markCompleted}
            variant="secondary"
            onPress={() => onChange("completed")}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row-reverse",
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  client: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  phone: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
  },
  service: {
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    textAlign: "right",
    marginTop: 12,
  },
  metaRow: {
    flexDirection: "column",
    gap: 6,
    marginTop: 10,
  },
  metaItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  notesBox: { padding: 10, borderRadius: 10, marginTop: 10 },
  notesText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 19,
  },
  priceRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#ece4f5",
  },
  priceLabel: { fontFamily: "Cairo_500Medium", fontSize: 13 },
  price: { fontFamily: "Cairo_700Bold", fontSize: 17 },
  actionsRow: { flexDirection: "row-reverse", gap: 10, marginTop: 14 },
});
