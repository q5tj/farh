/**
 * InfoTip — a small "info" button that opens an explanatory popover.
 *
 * Use it next to buttons or action tiles whose behaviour isn't obvious from
 * the label alone. The popover content should describe what the button does
 * in the current product (i.e. derived from the codebase / actual flow),
 * not generic UX copy.
 *
 * The popover is implemented as a Modal so it sits above any parent layout
 * and works identically on web and native. Tapping outside closes it.
 */

import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

interface InfoTipProps {
  title: string;
  body: string;
  /** Visual size of the question-mark icon. Default 14. */
  size?: number;
  /** Override tint — defaults to `useColors().primary`. */
  tint?: string;
}

export function InfoTip({ title, body, size = 14, tint }: InfoTipProps) {
  const c = useColors();
  const color = tint ?? c.primary;
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={(e) => {
          // Prevent the surrounding tile/card Pressable from also receiving
          // the press (would navigate away instead of opening the tip).
          e.stopPropagation?.();
          setOpen(true);
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={({ pressed }) => [
          styles.bubble,
          {
            backgroundColor: color + "1A",
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Feather name="help-circle" size={size} color={color} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: c.card, borderColor: c.border },
            ]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <View style={styles.header}>
              <View style={[styles.headerIcon, { backgroundColor: color + "1A" }]}>
                <Feather name="info" size={18} color={color} />
              </View>
              <Text style={[styles.title, { color: c.foreground }]}>
                {title}
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Feather name="x" size={20} color={c.mutedForeground} />
              </Pressable>
            </View>
            <Text style={[styles.body, { color: c.mutedForeground }]}>
              {body}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    textAlign: "right",
  },
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
  },
});
