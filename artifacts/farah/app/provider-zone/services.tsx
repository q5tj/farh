import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { downloadCsv, type CsvColumn } from "@/lib/csv-export";
import { parseCsvRows, pickField } from "@/lib/csv-import";
import {
  deleteService as deleteServiceDb,
  fetchProviderByOwner,
  setServiceActive,
  type Provider,
  type ProviderService,
  upsertService as upsertServiceDb,
} from "@/lib/data";
import { formatDurationMinutes } from "@/lib/date-format";
import { useT } from "@/lib/i18n";
import { uploadImage } from "@/lib/image-upload";

interface ImportRow {
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  price: number;
  duration: string;
  durationMinutes: number;
  imageUrl: string;
  errors: string[];
  rowNumber: number;
}

const TITLE_AR_ALIASES = ["titleAr", "اسم الخدمة (عربي)", "اسم الخدمة", "الاسم"];
const TITLE_EN_ALIASES = ["titleEn", "Service name (English)", "Name (English)", "name_en"];
const DESC_AR_ALIASES = ["descriptionAr", "الوصف (عربي)", "الوصف", "وصف"];
const DESC_EN_ALIASES = ["descriptionEn", "Description (English)", "description_en"];
const PRICE_ALIASES = ["price", "السعر"];
const DURATION_ALIASES = ["duration", "المدة"];
const DURATION_MIN_ALIASES = ["durationMinutes", "المدة بالدقائق", "minutes"];
const IMAGE_URL_ALIASES = ["imageUrl", "image_url", "رابط الصورة", "صورة"];

export default function ServicesScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";
  const userDbId = profile?.id ?? null;
  const providerId = profile?.providerId ?? null;

  // Own state: fetch the provider's own row directly (bypasses the
  // customer-facing approval filter on useApp().providers, and avoids any
  // staleness from the AppContext catalog cache). Re-fetches on focus and
  // after every mutation.
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loadingProvider, setLoadingProvider] = useState(true);
  // Trigger a catalog refresh in AppContext too, so the customer-facing
  // catalog stays in sync (other screens benefit).
  const { refresh: refreshAppCatalog } = useApp();

  const reloadProvider = useCallback(async () => {
    if (!userDbId) {
      setProvider(null);
      setLoadingProvider(false);
      return;
    }
    try {
      const p = await fetchProviderByOwner(userDbId, lang);
      setProvider(p);
    } catch (e) {
      console.warn("[services] reloadProvider failed", e);
    } finally {
      setLoadingProvider(false);
    }
  }, [userDbId, lang]);

  useEffect(() => {
    reloadProvider();
  }, [reloadProvider]);

  // Re-fetch every time the screen comes back into focus (e.g. after the
  // user navigates away and returns).
  useFocusEffect(
    useCallback(() => {
      reloadProvider();
    }, [reloadProvider]),
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderService | null>(null);
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [price, setPrice] = useState("");
  // Duration is collected as hours + minutes (15-minute steps) to match how
  // providers think about a service, then combined into total minutes for
  // the DB. Defaults: 1 hour, 0 minutes.
  const [durationHours, setDurationHours] = useState("1");
  const [durationMinutesPart, setDurationMinutesPart] = useState("0");
  const totalMinutes = useMemo(() => {
    const h = Math.max(0, Math.min(24, Number(durationHours) || 0));
    const m = Math.max(0, Math.min(59, Number(durationMinutesPart) || 0));
    return Math.max(15, Math.min(1440, h * 60 + m));
  }, [durationHours, durationMinutesPart]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imagePct, setImagePct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { session } = useAuth();
  const authUserId = session?.user.id ?? null;

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importDone, setImportDone] = useState<{
    inserted: number;
    failed: number;
  } | null>(null);

  const reset = () => {
    setTitleAr("");
    setTitleEn("");
    setDescriptionAr("");
    setDescriptionEn("");
    setPrice("");
    setDurationHours("1");
    setDurationMinutesPart("0");
    setImageUrl(null);
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
    setDescriptionAr(s.descriptionAr ?? "");
    setDescriptionEn(s.descriptionEn ?? "");
    setPrice(String(s.price));
    setDurationHours(String(Math.floor(s.durationMinutes / 60)));
    setDurationMinutesPart(String(s.durationMinutes % 60));
    setImageUrl(s.images?.[0] ?? null);
    setError("");
    setOpen(true);
  };

  const onPickImage = async () => {
    setError("");
    if (!authUserId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t("imagePermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (result.canceled || !result.assets[0]) return;
    setImageUploading(true);
    setImagePct(0);
    const job = uploadImage({
      uri: result.assets[0].uri,
      bucket: "provider-media",
      authUserId,
      fileName: `service-${Date.now()}`,
      withPublicUrl: true,
      compress: { maxWidth: 1200, quality: 0.78 },
      onProgress: (p) => setImagePct(Math.round(p * 100)),
    });
    try {
      const { publicUrl } = await job.promise;
      setImageUrl(publicUrl);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setError(msg || t("uploadFailed"));
    } finally {
      setImageUploading(false);
    }
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
    const minutes = totalMinutes;
    setSaving(true);
    try {
      await upsertServiceDb({
        id: editing?.id,
        providerId,
        titleAr: titleAr.trim(),
        titleEn: titleEn.trim(),
        descriptionAr: descriptionAr.trim() || undefined,
        descriptionEn: descriptionEn.trim() || undefined,
        price: Number(price.replace(/[^0-9]/g, "")) || 0,
        // Derive the legacy free-text label from the minutes so the two
        // columns can't disagree. Stored in Arabic — the UI re-derives the
        // display text from durationMinutes at render time anyway.
        duration: formatDurationMinutes(minutes, t, "ar"),
        durationMinutes: minutes,
        images: imageUrl ? [imageUrl] : [],
      });
      setOpen(false);
      reset();
      // Re-fetch own data + nudge the customer-facing catalog.
      await reloadProvider();
      refreshAppCatalog().catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const onExportServices = () => {
    if (!provider || provider.services.length === 0) return;
    const cols: CsvColumn<ProviderService>[] = [
      { key: "titleAr", header: "اسم الخدمة (عربي)" },
      { key: "titleEn", header: "Service name (English)" },
      { key: "descriptionAr", header: "الوصف (عربي)" },
      { key: "descriptionEn", header: "Description (English)" },
      { key: "price", header: "السعر" },
      { key: "duration", header: "المدة" },
      { key: "durationMinutes", header: "المدة بالدقائق" },
      {
        key: "images",
        header: "رابط الصورة",
        format: (v) => (Array.isArray(v) && v[0] ? String(v[0]) : ""),
      },
    ];
    downloadCsv(`services-${provider.name || "store"}.csv`, provider.services, cols);
  };

  const onDownloadTemplate = () => {
    const sample: ProviderService[] = [
      {
        id: "",
        providerId: "",
        title: "",
        titleAr: "تصوير زفاف باقة فضية",
        titleEn: "Silver wedding photography package",
        description: "",
        descriptionAr: "تصوير الحفل بالكامل + معالجة الصور",
        descriptionEn: "Full ceremony coverage + post-processing",
        price: 3000,
        duration: "4 ساعات",
        durationMinutes: 240,
        isActive: true,
        images: [""],
      },
    ];
    const cols: CsvColumn<ProviderService>[] = [
      { key: "titleAr", header: "اسم الخدمة (عربي)" },
      { key: "titleEn", header: "Service name (English)" },
      { key: "descriptionAr", header: "الوصف (عربي)" },
      { key: "descriptionEn", header: "Description (English)" },
      { key: "price", header: "السعر" },
      { key: "duration", header: "المدة" },
      { key: "durationMinutes", header: "المدة بالدقائق" },
      {
        key: "images",
        header: "رابط الصورة",
        format: (v) => (Array.isArray(v) && v[0] ? String(v[0]) : ""),
      },
    ];
    downloadCsv("services-template.csv", sample, cols);
  };

  const validateRow = (
    row: Record<string, string>,
    rowNumber: number,
  ): ImportRow => {
    const errors: string[] = [];
    const titleAr = pickField(row, TITLE_AR_ALIASES);
    const titleEn = pickField(row, TITLE_EN_ALIASES);
    const descAr = pickField(row, DESC_AR_ALIASES);
    const descEn = pickField(row, DESC_EN_ALIASES);
    const priceStr = pickField(row, PRICE_ALIASES);
    const duration = pickField(row, DURATION_ALIASES) || "غير محدد";
    const minStr = pickField(row, DURATION_MIN_ALIASES);
    const imageUrl = pickField(row, IMAGE_URL_ALIASES);

    if (!titleAr) errors.push(t("enterServiceNameAr"));
    if (!titleEn) errors.push(t("enterServiceNameEn"));
    const priceNum = Number((priceStr || "").replace(/[^0-9.]/g, ""));
    if (!priceStr || !Number.isFinite(priceNum) || priceNum <= 0) {
      errors.push(t("enterPrice"));
    }
    let minutes = Number(minStr) || 60;
    if (!Number.isFinite(minutes) || minutes < 15) minutes = 60;
    if (minutes > 1440) minutes = 1440;

    return {
      titleAr,
      titleEn,
      descriptionAr: descAr,
      descriptionEn: descEn,
      price: priceNum || 0,
      duration,
      durationMinutes: minutes,
      imageUrl,
      errors,
      rowNumber,
    };
  };

  const onPickImportFile = async () => {
    setImportError("");
    setImportDone(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      let text = "";
      if (Platform.OS === "web") {
        const file = (asset as unknown as { file?: File }).file;
        if (file) {
          text = await file.text();
        } else {
          const resp = await fetch(asset.uri);
          text = await resp.text();
        }
      } else {
        const resp = await fetch(asset.uri);
        text = await resp.text();
      }
      const { rows } = parseCsvRows(text);
      if (rows.length === 0) {
        setImportError(t("importEmptyFile"));
        setImportRows([]);
        setImportOpen(true);
        return;
      }
      const parsed = rows.map((r, idx) => validateRow(r, idx + 2)); // +2: header is line 1
      setImportRows(parsed);
      setImportOpen(true);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setImportError(msg || t("importParseFailed"));
      setImportOpen(true);
    }
  };

  const confirmImport = async () => {
    if (!providerId) return;
    const valid = importRows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) {
      setImportError(t("importNoValidRows"));
      return;
    }
    setImporting(true);
    setImportError("");
    let inserted = 0;
    let failed = 0;
    for (const r of valid) {
      try {
        await upsertServiceDb({
          providerId,
          titleAr: r.titleAr,
          titleEn: r.titleEn,
          descriptionAr: r.descriptionAr || undefined,
          descriptionEn: r.descriptionEn || undefined,
          price: r.price,
          duration: r.duration,
          durationMinutes: r.durationMinutes,
          images: r.imageUrl ? [r.imageUrl] : [],
        });
        inserted += 1;
      } catch (e) {
        console.warn("[services] import row failed", r, e);
        failed += 1;
      }
    }
    setImporting(false);
    setImportDone({ inserted, failed });
    await reloadProvider();
    refreshAppCatalog().catch(() => {});
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportRows([]);
    setImportError("");
    setImportDone(null);
  };

  const remove = async (s: ProviderService) => {
    if (!providerId) return;
    try {
      await deleteServiceDb(s.id);
      await reloadProvider();
      refreshAppCatalog().catch(() => {});
    } catch (e) {
      console.warn("[services] delete failed", e);
    }
  };

  const toggleActive = async (s: ProviderService) => {
    if (!providerId) return;
    try {
      await setServiceActive(s.id, !s.isActive);
      await reloadProvider();
      refreshAppCatalog().catch(() => {});
    } catch (e) {
      console.warn("[services] toggle active failed", e);
    }
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
          <View style={styles.headerActions}>
            <Pressable
              onPress={onPickImportFile}
              style={[styles.iconBtn, { backgroundColor: c.primaryBg }]}
              hitSlop={8}
            >
              <Feather name="upload" size={16} color={c.primary} />
            </Pressable>
            <Pressable
              onPress={onExportServices}
              disabled={!provider || provider.services.length === 0}
              style={[
                styles.iconBtn,
                {
                  backgroundColor: c.primaryBg,
                  opacity:
                    !provider || provider.services.length === 0 ? 0.4 : 1,
                },
              ]}
              hitSlop={8}
            >
              <Feather name="download" size={16} color={c.primary} />
            </Pressable>
            <Pressable
              onPress={openNew}
              style={[styles.addBtn, { backgroundColor: c.primary }]}
            >
              <Feather name="plus" size={18} color="#ffffff" />
            </Pressable>
          </View>
        }
      />
      {loadingProvider ? (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : !provider || provider.services.length === 0 ? (
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
              <View style={[styles.row, !s.isActive && { opacity: 0.55 }]}>
                {s.images && s.images[0] ? (
                  <Image
                    source={{ uri: s.images[0] }}
                    style={[
                      styles.cardThumb,
                      { backgroundColor: c.muted },
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.cardThumb,
                      styles.cardThumbPlaceholder,
                      { backgroundColor: c.muted, borderColor: c.border },
                    ]}
                  >
                    <Feather name="image" size={22} color={c.mutedForeground} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: c.foreground }]}>
                    {s.title}
                  </Text>
                  {s.description ? (
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.descSnippet,
                        { color: c.mutedForeground },
                      ]}
                    >
                      {s.description}
                    </Text>
                  ) : null}
                  <Text style={[styles.duration, { color: c.mutedForeground }]}>
                    {formatDurationMinutes(s.durationMinutes, t, lang)}
                  </Text>
                </View>
                <Text style={[styles.price, { color: c.primary }]}>
                  {s.price.toLocaleString()} ر.س
                </Text>
              </View>
              {!s.isActive ? (
                <Text
                  style={{
                    marginTop: 8,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: "#fef3c7",
                    color: "#92400e",
                    fontFamily: "Cairo_600SemiBold",
                    fontSize: 12,
                    textAlign: "right",
                  }}
                >
                  {t("serviceDisabled")}
                </Text>
              ) : null}
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
                  onPress={() => toggleActive(s)}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: s.isActive ? c.muted : "#dcfce7" },
                  ]}
                >
                  <Feather
                    name={s.isActive ? "eye-off" : "eye"}
                    size={14}
                    color={s.isActive ? c.foreground : "#166534"}
                  />
                  <Text
                    style={[
                      styles.actionText,
                      { color: s.isActive ? c.foreground : "#166534" },
                    ]}
                  >
                    {s.isActive ? t("disableService") : t("enableService")}
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
                style={{ maxHeight: 540 }}
                contentContainerStyle={{ gap: 12, paddingTop: 14 }}
                keyboardShouldPersistTaps="handled"
              >
                <View>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: c.foreground },
                    ]}
                  >
                    {t("serviceImageLabel")}
                  </Text>
                  <Pressable
                    onPress={onPickImage}
                    disabled={imageUploading}
                    style={[
                      styles.imagePicker,
                      {
                        borderColor: imageUrl ? c.primary : c.border,
                        backgroundColor: c.muted,
                      },
                    ]}
                  >
                    {imageUrl ? (
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.imageThumb}
                      />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Feather name="image" size={28} color={c.primary} />
                        <Text
                          style={[
                            styles.imageHintText,
                            { color: c.mutedForeground },
                          ]}
                        >
                          {t("serviceImageHint")}
                        </Text>
                      </View>
                    )}
                    {imageUploading ? (
                      <View style={styles.uploadOverlay}>
                        <ActivityIndicator color="#ffffff" />
                        <Text style={styles.uploadOverlayText}>
                          {t("serviceImageUploading", { percent: imagePct })}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                  {imageUrl && !imageUploading ? (
                    <Pressable
                      onPress={() => setImageUrl(null)}
                      style={styles.removeImageRow}
                      hitSlop={8}
                    >
                      <Feather name="trash-2" size={14} color={c.destructive} />
                      <Text
                        style={[
                          styles.removeImageText,
                          { color: c.destructive },
                        ]}
                      >
                        {t("removeImage")}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
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
                  numberOfLines={5}
                  style={{ height: 110, textAlignVertical: "top" }}
                />
                <Input
                  label={t("serviceDescEnLabel")}
                  value={descriptionEn}
                  onChangeText={setDescriptionEn}
                  placeholder={t("serviceDescEnPlaceholder")}
                  multiline
                  numberOfLines={4}
                  style={{ height: 90, textAlignVertical: "top" }}
                />
                <Input
                  label={t("servicePriceField")}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder="3000"
                />
                <View>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: c.foreground, marginBottom: 6 },
                    ]}
                  >
                    {t("serviceDurationLabel")}
                  </Text>
                  <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label={t("durationHoursField")}
                        value={durationHours}
                        onChangeText={setDurationHours}
                        keyboardType="numeric"
                        placeholder="1"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.fieldLabel,
                          { color: c.foreground, marginBottom: 6 },
                        ]}
                      >
                        {t("durationMinutesField")}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row-reverse",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        {["0", "15", "30", "45"].map((m) => {
                          const active = durationMinutesPart === m;
                          return (
                            <Pressable
                              key={m}
                              onPress={() => setDurationMinutesPart(m)}
                              style={{
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                borderRadius: 100,
                                borderWidth: 1.5,
                                borderColor: active ? c.primary : c.border,
                                backgroundColor: active
                                  ? c.primary
                                  : "transparent",
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: "Cairo_700Bold",
                                  fontSize: 13,
                                  color: active ? "#ffffff" : c.foreground,
                                }}
                              >
                                {m}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontFamily: "Cairo_500Medium",
                      fontSize: 12,
                      color: c.mutedForeground,
                      textAlign: "right",
                      marginTop: 8,
                    }}
                  >
                    {t("serviceDurationPreview", {
                      text: formatDurationMinutes(totalMinutes, t, lang),
                    })}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Cairo_400Regular",
                      fontSize: 11,
                      color: c.mutedForeground,
                      textAlign: "right",
                      marginTop: 4,
                      lineHeight: 18,
                    }}
                  >
                    {t("serviceDurationHelp")}
                  </Text>
                </View>
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

      <Modal
        visible={importOpen}
        animationType="slide"
        transparent
        onRequestClose={importing ? undefined : closeImport}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: c.background,
                borderRadius: c.radius,
                width: "100%",
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: c.foreground }]}>
              {t("importServicesTitle")}
            </Text>
            <Text
              style={[
                styles.importDesc,
                { color: c.mutedForeground },
              ]}
            >
              {t("importServicesDesc")}
            </Text>

            <Pressable
              onPress={onDownloadTemplate}
              style={styles.templateRow}
              hitSlop={6}
            >
              <Feather name="download" size={14} color={c.primary} />
              <Text style={[styles.templateText, { color: c.primary }]}>
                {t("downloadServicesTemplate")}
              </Text>
            </Pressable>

            {importDone ? (
              <View style={{ marginTop: 14, gap: 6 }}>
                <Text
                  style={[
                    styles.importDoneTitle,
                    { color: c.foreground },
                  ]}
                >
                  {t("importDoneTitle")}
                </Text>
                <Text
                  style={[
                    styles.importDoneDesc,
                    { color: c.mutedForeground },
                  ]}
                >
                  {t("importDoneSummary", {
                    inserted: importDone.inserted,
                    failed: importDone.failed,
                  })}
                </Text>
              </View>
            ) : importRows.length > 0 ? (
              <ScrollView
                style={{ maxHeight: 320, marginTop: 14 }}
                contentContainerStyle={{ gap: 8 }}
              >
                {importRows.map((r) => {
                  const ok = r.errors.length === 0;
                  return (
                    <View
                      key={r.rowNumber}
                      style={[
                        styles.importRow,
                        {
                          backgroundColor: ok ? c.primaryBg : "#fee2e2",
                          borderColor: ok ? c.primary : c.destructive,
                        },
                      ]}
                    >
                      <View
                        style={{
                          flexDirection: "row-reverse",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Feather
                          name={ok ? "check-circle" : "alert-circle"}
                          size={14}
                          color={ok ? c.primary : c.destructive}
                        />
                        <Text
                          style={[
                            styles.importRowLabel,
                            { color: c.foreground },
                          ]}
                        >
                          {t("importRowLabel", { n: r.rowNumber })} —{" "}
                          {r.titleAr || r.titleEn || "—"}
                        </Text>
                        {ok ? (
                          <Text
                            style={[
                              styles.importRowPrice,
                              { color: c.primary },
                            ]}
                          >
                            {r.price.toLocaleString()} ر.س
                          </Text>
                        ) : null}
                      </View>
                      {!ok ? (
                        <Text
                          style={[
                            styles.importRowError,
                            { color: c.destructive },
                          ]}
                        >
                          {r.errors.join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}

            {importRows.length > 0 && !importDone ? (
              <View style={styles.importSummary}>
                <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                  {t("importValidCount", {
                    count: importRows.filter((r) => r.errors.length === 0).length,
                  })}
                </Text>
                {importRows.some((r) => r.errors.length > 0) ? (
                  <Text style={{ color: c.destructive, fontSize: 12 }}>
                    {t("importInvalidCount", {
                      count: importRows.filter((r) => r.errors.length > 0).length,
                    })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {importError ? (
              <Text
                style={{
                  color: c.destructive,
                  fontFamily: "Cairo_500Medium",
                  fontSize: 12,
                  textAlign: "right",
                  marginTop: 10,
                }}
              >
                {importError}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}>
              {importDone ? (
                <View style={{ flex: 1 }}>
                  <Button label={t("done")} onPress={closeImport} />
                </View>
              ) : importRows.length === 0 ? (
                <>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t("importPickFile")}
                      onPress={onPickImportFile}
                      icon={<Feather name="upload" size={16} color="#ffffff" />}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t("cancel")}
                      variant="ghost"
                      onPress={closeImport}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t("importConfirm", {
                        count: importRows.filter((r) => r.errors.length === 0)
                          .length,
                      })}
                      onPress={confirmImport}
                      loading={importing}
                      disabled={
                        importRows.filter((r) => r.errors.length === 0).length === 0
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t("cancel")}
                      variant="ghost"
                      onPress={closeImport}
                      disabled={importing}
                    />
                  </View>
                </>
              )}
            </View>
          </View>
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
  headerActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  cardThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: "hidden",
  },
  cardThumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  descSnippet: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    marginTop: 4,
    lineHeight: 18,
  },
  duration: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  price: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  fieldLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    textAlign: "right",
    marginBottom: 8,
  },
  imagePicker: {
    width: "100%",
    height: 160,
    borderRadius: 14,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  imageThumb: { width: "100%", height: "100%" },
  imagePlaceholder: { alignItems: "center", justifyContent: "center", gap: 6 },
  imageHintText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    textAlign: "center",
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  uploadOverlayText: {
    color: "#ffffff",
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  removeImageRow: {
    marginTop: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
  },
  removeImageText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
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
  importDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 19,
    marginTop: 6,
  },
  templateRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
    marginTop: 10,
  },
  templateText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  importRow: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  importRowLabel: {
    flex: 1,
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    textAlign: "right",
  },
  importRowPrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
  },
  importRowError: {
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
    textAlign: "right",
    marginRight: 22,
  },
  importSummary: {
    marginTop: 10,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  importDoneTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
  importDoneDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
  },
});
