import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";

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
