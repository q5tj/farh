import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
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

export default function CategoriesScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { categories, addCategory, removeCategory } = useApp();
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const ar = nameAr.trim();
    const en = nameEn.trim();
    if (!ar || !en) return;
    setBusy(true);
    try {
      await addCategory({ nameAr: ar, nameEn: en });
      setNameAr("");
      setNameEn("");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = (id: string, label: string) => {
    const run = () => removeCategory(id);
    const confirmText = t("categoriesDeleteConfirm", { label });
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(confirmText)) run();
      return;
    }
    Alert.alert(t("delete"), confirmText, [
      { text: t("cancel"), style: "cancel" },
      { text: t("delete"), style: "destructive", onPress: run },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("categoriesScreenTitle")} />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 30,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Card>
          <Text style={[styles.label, { color: c.foreground }]}>
            {t("categoriesAddNew")}
          </Text>
          <View style={{ marginTop: 10 }}>
            <Input
              label={t("categoryNameArLabel")}
              placeholder={t("categoryNameArPlaceholder")}
              value={nameAr}
              onChangeText={setNameAr}
              maxLength={60}
            />
          </View>
          <View style={{ marginTop: 10 }}>
            <Input
              label={t("categoryNameEnLabel")}
              placeholder={t("categoryNameEnPlaceholder")}
              value={nameEn}
              onChangeText={setNameEn}
              maxLength={60}
            />
          </View>
          <View style={{ marginTop: 12 }}>
            <Button
              label={t("add")}
              onPress={handleAdd}
              loading={busy}
              disabled={!nameAr.trim() || !nameEn.trim()}
            />
          </View>
        </Card>

        <Text
          style={[
            styles.sectionTitle,
            { color: c.foreground, marginTop: 22 },
          ]}
        >
          {t("categoriesCount", { count: categories.length })}
        </Text>

        <View style={{ gap: 8, marginTop: 12 }}>
          {categories.map((cat) => (
            <View
              key={cat.id}
              style={[
                styles.itemRow,
                {
                  backgroundColor: c.card,
                  borderColor: c.border,
                  borderRadius: c.radius - 4,
                },
              ]}
            >
              <View
                style={[styles.iconWrap, { backgroundColor: cat.color + "1A" }]}
              >
                <Feather name={cat.icon} size={18} color={cat.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: c.foreground }]}>
                  {cat.nameAr}
                </Text>
                <Text style={[styles.itemNameEn, { color: c.mutedForeground }]}>
                  {cat.nameEn}
                </Text>
              </View>
              <Pressable
                onPress={() => handleRemove(cat.id, cat.nameAr)}
                style={styles.deleteBtn}
              >
                <Feather name="trash-2" size={16} color={c.destructive} />
              </Pressable>
            </View>
          ))}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
  itemRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  itemName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, textAlign: "right" },
  itemNameEn: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 2,
    textAlign: "right",
  },
  deleteBtn: {
    padding: 8,
  },
});
