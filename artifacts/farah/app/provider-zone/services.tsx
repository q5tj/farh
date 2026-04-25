import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
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
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { STRINGS } from "@/constants/strings";
import { ProviderService, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function ServicesScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getProvider, upsertProviderService, removeProviderService } = useApp();
  const providerId = user?.providerId ?? "p1";
  const provider = getProvider(providerId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderService | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");

  const reset = () => {
    setTitle("");
    setPrice("");
    setDuration("");
    setEditing(null);
  };

  const openNew = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (s: ProviderService) => {
    setEditing(s);
    setTitle(s.title);
    setPrice(String(s.price));
    setDuration(s.duration);
    setOpen(true);
  };

  const save = async () => {
    if (!title.trim() || !price.trim()) return;
    const id = editing?.id ?? `s_${Date.now()}`;
    await upsertProviderService(providerId, {
      id,
      title: title.trim(),
      price: Number(price.replace(/[^0-9]/g, "")) || 0,
      duration: duration.trim() || "غير محدد",
    });
    setOpen(false);
    reset();
  };

  const remove = (s: ProviderService) => {
    removeProviderService(providerId, s.id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={STRINGS.myServices}
        right={
          <Pressable
            onPress={openNew}
            style={[styles.addBtn, { backgroundColor: c.primary }]}
          >
            <Feather name="plus" size={18} color="#ffffff" />
          </Pressable>
        }
      />
      {!provider || provider.services.length === 0 ? (
        <EmptyState
          icon="package"
          title="لم تضف خدمات بعد"
          description="ابدأ بإضافة خدماتك وأسعارها لتظهر للعملاء"
          cta={{ label: STRINGS.addService, onPress: openNew }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 12,
          }}
        >
          {provider.services.map((s) => (
            <Card key={s.id}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: c.foreground }]}>
                    {s.title}
                  </Text>
                  <Text style={[styles.duration, { color: c.mutedForeground }]}>
                    {s.duration}
                  </Text>
                </View>
                <Text style={[styles.price, { color: c.primary }]}>
                  {s.price.toLocaleString()} ر.س
                </Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => openEdit(s)}
                  style={[styles.actionBtn, { backgroundColor: c.primaryBg }]}
                >
                  <Feather name="edit-2" size={14} color={c.primary} />
                  <Text style={[styles.actionText, { color: c.primary }]}>
                    {STRINGS.editService}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => remove(s)}
                  style={[styles.actionBtn, { backgroundColor: "#fee2e2" }]}
                >
                  <Feather name="trash-2" size={14} color={c.destructive} />
                  <Text style={[styles.actionText, { color: c.destructive }]}>
                    {STRINGS.deleteService}
                  </Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%" }}
          >
            <View
              style={[
                styles.modalCard,
                { backgroundColor: c.background, borderRadius: c.radius },
              ]}
            >
              <Text style={[styles.modalTitle, { color: c.foreground }]}>
                {editing ? STRINGS.editService : STRINGS.addService}
              </Text>
              <View style={{ marginTop: 14, gap: 12 }}>
                <Input
                  label={STRINGS.serviceTitle}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="مثال: تصوير زفاف باقة فضية"
                />
                <Input
                  label={STRINGS.servicePrice}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder="3000"
                />
                <Input
                  label={STRINGS.serviceDuration}
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="مثال: 4 ساعات"
                />
              </View>
              <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <Button label={STRINGS.saveService} onPress={save} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={STRINGS.cancel}
                    variant="ghost"
                    onPress={() => setOpen(false)}
                  />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row-reverse", alignItems: "center" },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  duration: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  price: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  actions: {
    flexDirection: "row-reverse",
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { padding: 22 },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    textAlign: "right",
  },
});
