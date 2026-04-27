import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { ProviderService, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

export default function ServicesScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const { getProvider, upsertProviderService, removeProviderService } = useApp();
  const providerId = profile?.providerId ?? null;
  const provider = providerId ? getProvider(providerId) : undefined;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderService | null>(null);
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setTitleAr("");
    setTitleEn("");
    setDescriptionAr("");
    setDescriptionEn("");
    setPrice("");
    setDuration("");
    setDurationMinutes("60");
    setError("");
    setEditing(null);
  };

  const openNew = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (s: ProviderService) => {
    setEditing(s);
    setTitleAr(s.titleAr);
    setTitleEn(s.titleEn ?? "");
    setDescriptionAr("");
    setDescriptionEn("");
    setPrice(String(s.price));
    setDuration(s.duration);
    setDurationMinutes(String(s.durationMinutes));
    setError("");
    setOpen(true);
  };

  const save = async () => {
    setError("");
    if (!providerId) return;
    if (!titleAr.trim()) {
      setError(t("enterServiceNameAr"));
      return;
    }
    if (!titleEn.trim()) {
      setError(t("enterServiceNameEn"));
      return;
    }
    if (!price.trim()) {
      setError(t("enterPrice"));
      return;
    }
    const minutes = Math.max(15, Math.min(1440, Number(durationMinutes) || 60));
    setSaving(true);
    try {
      await upsertProviderService(providerId, {
        id: editing?.id,
        titleAr: titleAr.trim(),
        titleEn: titleEn.trim(),
        descriptionAr: descriptionAr.trim() || undefined,
        descriptionEn: descriptionEn.trim() || undefined,
        price: Number(price.replace(/[^0-9]/g, "")) || 0,
        duration: duration.trim() || "غير محدد",
        durationMinutes: minutes,
      });
      setOpen(false);
      reset();
    } finally {
      setSaving(false);
    }
  };

  const remove = (s: ProviderService) => {
    if (!providerId) return;
    removeProviderService(providerId, s.id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("myServices")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/provider-zone");
        }}
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
          title={t("noServicesAddedYet")}
          description={t("startAddingServices")}
          cta={{ label: t("addService"), onPress: openNew }}
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
                    {t("editService")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => remove(s)}
                  style={[styles.actionBtn, { backgroundColor: "#fee2e2" }]}
                >
                  <Feather name="trash-2" size={14} color={c.destructive} />
                  <Text style={[styles.actionText, { color: c.destructive }]}>
                    {t("deleteService")}
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
                {editing ? t("editService") : t("addService")}
              </Text>
              <ScrollView
                style={{ maxHeight: 480 }}
                contentContainerStyle={{ gap: 12, paddingTop: 14 }}
                keyboardShouldPersistTaps="handled"
              >
                <Input
                  label={t("serviceNameArLabel")}
                  value={titleAr}
                  onChangeText={setTitleAr}
                  placeholder={t("serviceNameArExample")}
                />
                <Input
                  label={t("serviceNameEnLabel")}
                  value={titleEn}
                  onChangeText={setTitleEn}
                  placeholder={t("serviceNameEnExample")}
                  autoCapitalize="words"
                />
                <Input
                  label={t("serviceDescArLabel")}
                  value={descriptionAr}
                  onChangeText={setDescriptionAr}
                  placeholder={t("serviceDescArPlaceholder")}
                  multiline
                  numberOfLines={3}
                  style={{ height: 70, textAlignVertical: "top" }}
                />
                <Input
                  label={t("serviceDescEnLabel")}
                  value={descriptionEn}
                  onChangeText={setDescriptionEn}
                  placeholder={t("serviceDescEnPlaceholder")}
                  multiline
                  numberOfLines={3}
                  style={{ height: 70, textAlignVertical: "top" }}
                />
                <Input
                  label={t("servicePriceField")}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder="3000"
                />
                <Input
                  label={t("serviceDuration")}
                  value={duration}
                  onChangeText={setDuration}
                  placeholder={t("serviceDurationExample")}
                />
                <Input
                  label={t("serviceDurationMinutesLabel")}
                  value={durationMinutes}
                  onChangeText={setDurationMinutes}
                  keyboardType="numeric"
                  placeholder="60"
                />
                {error ? (
                  <Text
                    style={{
                      color: c.destructive,
                      fontFamily: "Cairo_500Medium",
                      fontSize: 12,
                      textAlign: "right",
                    }}
                  >
                    {error}
                  </Text>
                ) : null}
              </ScrollView>
              <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <Button label={t("saveService")} onPress={save} loading={saving} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("cancel")}
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
