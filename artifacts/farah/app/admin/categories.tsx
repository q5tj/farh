import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

export default function CategoriesScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { categories, addCategory, removeCategory } = useApp();
  const [name, setName] = useState("");

  const handleAdd = async () => {
    if (!name.trim()) return;
    await addCategory(name.trim());
    setName("");
  };

  const handleRemove = (id: string, label: string) => {
    const run = () => removeCategory(id);
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`حذف ${label}؟`)) run();
      return;
    }
    Alert.alert("حذف التصنيف", `هل تريد حذف "${label}"؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: run },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <ScreenHeader title="إدارة التصنيفات" />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 30,
        }}
      >
        <Card>
          <Text style={[styles.label, { color: c.foreground }]}>
            إضافة تصنيف جديد
          </Text>
          <View style={{ marginTop: 10 }}>
            <Input
              placeholder="مثال: ديكور خارجي"
              value={name}
              onChangeText={setName}
            />
          </View>
          <View style={{ marginTop: 12 }}>
            <Button label="إضافة" onPress={handleAdd} />
          </View>
        </Card>

        <Text
          style={[
            styles.sectionTitle,
            { color: c.foreground, marginTop: 22 },
          ]}
        >
          التصنيفات الحالية ({categories.length})
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
              <Text style={[styles.itemName, { color: c.foreground }]}>
                {cat.name}
              </Text>
              <Pressable
                onPress={() => handleRemove(cat.id, cat.name)}
                style={styles.deleteBtn}
              >
                <Feather name="trash-2" size={16} color={c.destructive} />
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: "Inter_700Bold", fontSize: 14, textAlign: "right" },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
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
  itemName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, textAlign: "right" },
  deleteBtn: {
    padding: 8,
  },
});
