import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { BookingStatus } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { STATUS_LABELS } from "@/constants/strings";

export function StatusBadge({ status }: { status: BookingStatus }) {
  const c = useColors();
  const map: Record<BookingStatus, { bg: string; fg: string }> = {
    pending: { bg: "#fef3c7", fg: "#92400e" },
    accepted: { bg: "#dbeafe", fg: "#1e40af" },
    rejected: { bg: "#fee2e2", fg: "#991b1b" },
    completed: { bg: "#dcfce7", fg: "#166534" },
    cancelled: { bg: "#f1f5f9", fg: "#475569" },
  };
  const colorPair = map[status];
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colorPair.bg,
          borderRadius: c.radius - 6,
        },
      ]}
    >
      <Text style={[styles.text, { color: colorPair.fg }]}>
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  text: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
});
