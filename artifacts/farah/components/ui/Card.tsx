import React from "react";
import { Platform, StyleSheet, View, ViewProps } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props extends ViewProps {
  padded?: boolean;
}

export function Card({ children, style, padded = true, ...rest }: Props) {
  const c = useColors();
  return (
    <View
      {...rest}
      style={[
        styles.card,
        {
          backgroundColor: c.card,
          borderRadius: c.radius,
          borderColor: c.border,
          padding: padded ? 16 : 0,
          ...(Platform.OS === "web"
            ? ({
                boxShadow: "0 1px 3px rgba(123,44,191,0.06)",
              } as object)
            : {
                shadowColor: "#7b2cbf",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
});
