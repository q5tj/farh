import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  rightIcon?: React.ReactNode;
}

export function Input({ label, error, rightIcon, style, ...rest }: Props) {
  const c = useColors();
  // On iOS, applying writingDirection:"rtl" to a numeric/phone-pad input
  // makes the typed digits invisible (cursor + glyphs land in negative
  // space). Numeric input is naturally LTR — only force RTL writing
  // direction for free-form text fields.
  const isNumericKb =
    rest.keyboardType === "number-pad" ||
    rest.keyboardType === "numeric" ||
    rest.keyboardType === "decimal-pad" ||
    rest.keyboardType === "phone-pad";
  return (
    <View style={{ width: "100%" }}>
      {label ? (
        <Text style={[styles.label, { color: c.foreground }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.wrap,
          {
            borderColor: error ? c.destructive : c.border,
            backgroundColor: c.background,
            borderRadius: c.radius - 4,
          },
        ]}
      >
        <TextInput
          {...rest}
          placeholderTextColor={c.mutedForeground}
          style={[
            styles.input,
            {
              color: c.foreground,
              textAlign: "right",
              writingDirection: isNumericKb ? "ltr" : "rtl",
            },
            style,
          ]}
        />
        {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: c.destructive }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    marginBottom: 8,
    textAlign: "right",
  },
  wrap: {
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    height: 50,
    fontFamily: "Cairo_400Regular",
    fontSize: 16,
  },
  icon: { marginLeft: 8 },
  error: {
    marginTop: 6,
    fontSize: 12,
    textAlign: "right",
  },
});
