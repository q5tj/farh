import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/ui/Button";

interface Props {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  description?: string;
  cta?: { label: string; onPress: () => void };
}

export function EmptyState({ icon = "inbox", title, description, cta }: Props) {
  const c = useColors();
  return (
    <View style={styles.wrap}>
      <View
        style={[styles.iconWrap, { backgroundColor: c.primaryBg }]}
      >
        <Feather name={icon} size={32} color={c.primary} />
      </View>
      <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.desc, { color: c.mutedForeground }]}>
          {description}
        </Text>
      ) : null}
      {cta ? (
        <View style={{ marginTop: 20, width: 220 }}>
          <Button label={cta.label} onPress={cta.onPress} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 8,
  },
  desc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
});
