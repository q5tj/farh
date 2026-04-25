import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

export default function AdminSettings() {
  const c = useColors();
  const insets = useSafeAreaInsets();
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <ScreenHeader title="العمولة والإعدادات" />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 30,
          gap: 14,
        }}
      >
        <Card>
          <Text style={[styles.title, { color: c.foreground }]}>
            نسبة عمولة المنصة
          </Text>
          <Text style={[styles.desc, { color: c.mutedForeground }]}>
            تُخصم تلقائياً من إيرادات مزودي الخدمة عند اكتمال كل حجز.
          </Text>
          <View style={{ marginTop: 14 }}>
            <Input
              label="نسبة العمولة (%)"
              value={value}
              onChangeText={setValue}
              keyboardType="numeric"
              maxLength={4}
            />
          </View>
          <View style={{ marginTop: 14 }}>
            <Button
              label={saved ? "تم الحفظ بنجاح ✓" : "حفظ التغييرات"}
              onPress={save}
              variant={saved ? "secondary" : "primary"}
            />
          </View>
        </Card>

        <Card>
          <Text style={[styles.title, { color: c.foreground }]}>
            معلومات النظام
          </Text>
          <View style={{ marginTop: 14, gap: 12 }}>
            <InfoRow label="الإصدار" value="1.0.0" />
            <InfoRow label="حالة الخدمة" value="نشط" valueColor="#16a34a" />
            <InfoRow label="نوع التخزين" value="محلي (آمن)" />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
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
