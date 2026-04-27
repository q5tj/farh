import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

export default function AdminSettings() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { commissionRate, setCommissionRate } = useApp();
  const [value, setValue] = useState(String(commissionRate));
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const n = Math.max(0, Math.min(50, Number(value) || 0));
    await setCommissionRate(n);
    setValue(String(n));
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("settingsScreenTitle")} />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 30,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Card>
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("settingsCommissionTitle")}
          </Text>
          <Text style={[styles.desc, { color: c.mutedForeground }]}>
            {t("settingsCommissionDescription")}
          </Text>
          <View style={{ marginTop: 14 }}>
            <Input
              label={t("commissionLabel")}
              value={value}
              onChangeText={setValue}
              keyboardType="numeric"
              maxLength={4}
            />
          </View>
          <View style={{ marginTop: 14 }}>
            <Button
              label={saved ? t("savedCheck") : t("saveChanges")}
              onPress={save}
              variant={saved ? "secondary" : "primary"}
            />
          </View>
        </Card>

        <Card>
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("settingsSysInfoTitle")}
          </Text>
          <View style={{ marginTop: 14, gap: 12 }}>
            <InfoRow label={t("settingsRowVersion")} value="1.0.0" />
            <InfoRow label={t("settingsRowStatus")} value={t("settingsRowStatusActive")} valueColor="#16a34a" />
            <InfoRow label={t("settingsRowStorage")} value={t("settingsRowStorageValue")} />
          </View>
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const c = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: c.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.infoValue, { color: valueColor ?? c.foreground }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: "Cairo_700Bold", fontSize: 16, textAlign: "right" },
  desc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    marginTop: 6,
    lineHeight: 21,
    textAlign: "right",
  },
  infoRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: { fontFamily: "Cairo_500Medium", fontSize: 13 },
  infoValue: { fontFamily: "Cairo_700Bold", fontSize: 13 },
});
