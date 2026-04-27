import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
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
import { CITIES } from "@/constants/seedData";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { becomeProvider } from "@/lib/data";
import { useT } from "@/lib/i18n";
import {
  uploadImage,
  UploadCancelledError,
  type UploadJob,
} from "@/lib/image-upload";

type DocKey = "logo" | "cr" | "tax" | "address";

interface DocSlot {
  /** Local URI shown in the thumbnail (compressed before upload happens). */
  localUri: string | null;
  /** Storage object key (relative to bucket). */
  path: string | null;
  /** Public URL (logo only). */
  publicUrl: string | null;
  uploading: boolean;
  progress: number;
  error: string | null;
}

const EMPTY_SLOT: DocSlot = {
  localUri: null,
  path: null,
  publicUrl: null,
  uploading: false,
  progress: 0,
  error: null,
};

const DOC_BUCKET: Record<DocKey, "provider-logos" | "provider-docs"> = {
  logo: "provider-logos",
  cr: "provider-docs",
  tax: "provider-docs",
  address: "provider-docs",
};

const DOC_FILE_NAME: Record<DocKey, string> = {
  logo: "logo",
  cr: "cr",
  tax: "tax",
  address: "national-address",
};

export default function ProviderOnboarding() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile, session, refreshProfile } = useAuth();
  const { categories, refresh, commissionRate } = useApp();

  // If user already has a provider record, the gate (provider-zone/index.tsx)
  // routes them to the right screen. Bouncing back avoids the user re-running
  // become_provider and getting "Already a provider".
  useEffect(() => {
    if (profile?.providerId) {
      router.replace("/provider-zone");
    }
  }, [profile?.providerId]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [city, setCity] = useState<string>(profile?.city ?? CITIES[0]);
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [acceptedCommission, setAcceptedCommission] = useState(false);

  const [slots, setSlots] = useState<Record<DocKey, DocSlot>>({
    logo: EMPTY_SLOT,
    cr: EMPTY_SLOT,
    tax: EMPTY_SLOT,
    address: EMPTY_SLOT,
  });

  const jobsRef = useRef<Partial<Record<DocKey, UploadJob>>>({});
  const submitLockRef = useRef(false);

  // Cancel any in-flight upload on unmount.
  useEffect(() => {
    return () => {
      Object.values(jobsRef.current).forEach((job) => job?.cancel());
    };
  }, []);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  useEffect(() => {
    if (!categoryId && sortedCategories.length > 0) {
      setCategoryId(sortedCategories[0].id);
    }
  }, [categoryId, sortedCategories]);

  const setSlot = (key: DocKey, patch: Partial<DocSlot>) => {
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const pickAndUpload = async (key: DocKey) => {
    setError("");
    if (!session?.user.id) {
      setError(t("noUserId"));
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setSlot(key, { error: t("imagePermissionDenied") });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    jobsRef.current[key]?.cancel();

    const asset = result.assets[0];
    setSlot(key, {
      localUri: asset.uri,
      path: null,
      publicUrl: null,
      uploading: true,
      progress: 0,
      error: null,
    });

    const isLogo = key === "logo";
    const job = uploadImage({
      uri: asset.uri,
      bucket: DOC_BUCKET[key],
      authUserId: session.user.id,
      fileName: DOC_FILE_NAME[key],
      withPublicUrl: isLogo,
      compress:
        key === "logo"
          ? { maxWidth: 800, quality: 0.8 }
          : { maxWidth: 1800, quality: 0.7 },
      onProgress: (pct) =>
        setSlot(key, { progress: Math.round(pct * 100) }),
    });
    jobsRef.current[key] = job;

    try {
      const { path, publicUrl } = await job.promise;
      setSlot(key, {
        path,
        publicUrl: publicUrl || null,
        uploading: false,
        progress: 100,
      });
    } catch (e) {
      if (e instanceof UploadCancelledError) {
        setSlot(key, { uploading: false, error: t("uploadCancelled") });
      } else {
        const msg = (e as Error)?.message ?? "";
        setSlot(key, { uploading: false, error: msg || t("uploadFailed") });
      }
    } finally {
      jobsRef.current[key] = undefined;
    }
  };

  const removeSlot = (key: DocKey) => {
    jobsRef.current[key]?.cancel();
    setSlot(key, EMPTY_SLOT);
  };

  const allDocsReady =
    !!slots.logo.path &&
    !!slots.cr.path &&
    !!slots.tax.path &&
    !!slots.address.path;

  const submit = async () => {
    setError("");
    if (submitLockRef.current) return;
    if (!profile) return;

    if (!name.trim()) {
      setError(t("enterBusinessName"));
      return;
    }
    if (!categoryId) {
      setError(t("pickCategory"));
      return;
    }
    if (!allDocsReady) {
      setError(t("uploadAllDocsFirst"));
      return;
    }
    if (!acceptedCommission) {
      setError(t("acceptCommissionFirst"));
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await becomeProvider({
        categoryId,
        name: name.trim(),
        description: description.trim() || undefined,
        city: city || undefined,
        phone: phone.trim() || undefined,
        email: profile.email ?? undefined,
        logoUrl: slots.logo.publicUrl ?? null,
        commercialRegistrationPath: slots.cr.path,
        taxNumberPath: slots.tax.path,
        nationalAddressPath: slots.address.path,
      });

      await refreshProfile();
      await refresh();
      router.replace("/provider-zone");
    } catch (e) {
      const msg = (e as Error)?.message ?? t("createProviderFailed");
      setError(msg);
      if (Platform.OS !== "web") {
        Alert.alert(t("error"), msg);
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("becomeProvider")}
        subtitle={t("providerOnboardingDesc")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/profile");
        }}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Card>
          <View
            style={[
              styles.heroIcon,
              { backgroundColor: "rgba(123,44,191,0.1)" },
            ]}
          >
            <Feather name="briefcase" size={28} color={c.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: c.foreground }]}>
            {t("startBusinessTitle")}
          </Text>
          <Text style={[styles.heroDesc, { color: c.mutedForeground }]}>
            {t("startBusinessDesc")}
          </Text>
        </Card>

        <Input
          label={t("businessName")}
          placeholder={t("businessNameExample")}
          value={name}
          onChangeText={setName}
        />

        <Input
          label={t("shortBio")}
          placeholder={t("shortBioPlaceholder")}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          style={{ height: 90, textAlignVertical: "top" }}
        />

        <View>
          <Text style={[styles.label, { color: c.foreground }]}>
            {t("category")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          >
            {sortedCategories.map((cat) => {
              const active = categoryId === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategoryId(cat.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? c.primary : c.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? "#ffffff" : c.foreground },
                    ]}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View>
          <Text style={[styles.label, { color: c.foreground }]}>
            {t("city")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          >
            {CITIES.map((cityName) => {
              const active = city === cityName;
              return (
                <Pressable
                  key={cityName}
                  onPress={() => setCity(cityName)}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? c.primary : c.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? "#ffffff" : c.foreground },
                    ]}
                  >
                    {cityName}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Input
          label={t("contactPhone")}
          placeholder="5XXXXXXXX"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Card>
          <Text style={[styles.sectionTitle, { color: c.foreground }]}>
            {t("documentsSection")}
          </Text>
          <Text style={[styles.sectionDesc, { color: c.mutedForeground }]}>
            {t("documentsSectionDesc")}
          </Text>

          <DocPicker
            label={t("providerLogo")}
            desc={t("providerLogoDesc")}
            slot={slots.logo}
            onPick={() => pickAndUpload("logo")}
            onRemove={() => removeSlot("logo")}
            uploadingLabel={t("uploadingPercent", {
              percent: slots.logo.progress,
            })}
            replaceLabel={t("replaceImage")}
            removeLabel={t("removeImage")}
            pickLabel={t("pickImage")}
            primary={c.primary}
            muted={c.muted}
            border={c.border}
            mutedFg={c.mutedForeground}
            destructive={c.destructive}
          />
          <DocPicker
            label={t("commercialRegistration")}
            desc={t("commercialRegistrationDesc")}
            slot={slots.cr}
            onPick={() => pickAndUpload("cr")}
            onRemove={() => removeSlot("cr")}
            uploadingLabel={t("uploadingPercent", {
              percent: slots.cr.progress,
            })}
            replaceLabel={t("replaceImage")}
            removeLabel={t("removeImage")}
            pickLabel={t("pickImage")}
            primary={c.primary}
            muted={c.muted}
            border={c.border}
            mutedFg={c.mutedForeground}
            destructive={c.destructive}
          />
          <DocPicker
            label={t("taxNumber")}
            desc={t("taxNumberDesc")}
            slot={slots.tax}
            onPick={() => pickAndUpload("tax")}
            onRemove={() => removeSlot("tax")}
            uploadingLabel={t("uploadingPercent", {
              percent: slots.tax.progress,
            })}
            replaceLabel={t("replaceImage")}
            removeLabel={t("removeImage")}
            pickLabel={t("pickImage")}
            primary={c.primary}
            muted={c.muted}
            border={c.border}
            mutedFg={c.mutedForeground}
            destructive={c.destructive}
          />
          <DocPicker
            label={t("nationalAddress")}
            desc={t("nationalAddressDesc")}
            slot={slots.address}
            onPick={() => pickAndUpload("address")}
            onRemove={() => removeSlot("address")}
            uploadingLabel={t("uploadingPercent", {
              percent: slots.address.progress,
            })}
            replaceLabel={t("replaceImage")}
            removeLabel={t("removeImage")}
            pickLabel={t("pickImage")}
            primary={c.primary}
            muted={c.muted}
            border={c.border}
            mutedFg={c.mutedForeground}
            destructive={c.destructive}
          />
        </Card>

        <Card>
          <View style={styles.commissionHeader}>
            <Feather name="percent" size={18} color={c.primary} />
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              {t("commissionDisclosureTitle")}
            </Text>
          </View>
          <Text style={[styles.sectionDesc, { color: c.mutedForeground }]}>
            {t("commissionDisclosureBody", { rate: String(commissionRate) })}
          </Text>
          <Text
            style={[
              styles.lockedNote,
              { color: c.mutedForeground, borderColor: c.border },
            ]}
          >
            {t("commissionLockedNote")}
          </Text>
          <Pressable
            onPress={() => setAcceptedCommission((v) => !v)}
            style={[
              styles.checkRow,
              {
                borderColor: acceptedCommission ? c.primary : c.border,
                backgroundColor: acceptedCommission
                  ? "rgba(123,44,191,0.06)"
                  : "transparent",
              },
            ]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: acceptedCommission ? c.primary : c.border,
                  backgroundColor: acceptedCommission
                    ? c.primary
                    : "transparent",
                },
              ]}
            >
              {acceptedCommission ? (
                <Feather name="check" size={14} color="#ffffff" />
              ) : null}
            </View>
            <Text style={[styles.checkText, { color: c.foreground }]}>
              {t("commissionAcceptanceLabel")}
            </Text>
          </Pressable>
        </Card>

        {error ? (
          <Text style={[styles.errorText, { color: c.destructive }]}>
            {error}
          </Text>
        ) : null}

        <View style={{ marginTop: 8 }}>
          <Button
            label={t("finishOnboarding")}
            onPress={submit}
            loading={submitting}
            size="lg"
            disabled={!allDocsReady || !acceptedCommission}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

interface DocPickerProps {
  label: string;
  desc: string;
  slot: DocSlot;
  onPick: () => void;
  onRemove: () => void;
  uploadingLabel: string;
  pickLabel: string;
  replaceLabel: string;
  removeLabel: string;
  primary: string;
  muted: string;
  border: string;
  mutedFg: string;
  destructive: string;
}

function DocPicker({
  label,
  desc,
  slot,
  onPick,
  onRemove,
  uploadingLabel,
  pickLabel,
  replaceLabel,
  removeLabel,
  primary,
  muted,
  border,
  mutedFg,
  destructive,
}: DocPickerProps) {
  const ready = !!slot.path && !slot.uploading;
  return (
    <View style={[styles.docRow, { borderColor: border }]}>
      <View style={styles.docInfo}>
        <Text style={styles.docLabel}>{label}</Text>
        <Text style={[styles.docDesc, { color: mutedFg }]}>{desc}</Text>
        {slot.error ? (
          <Text style={[styles.docError, { color: destructive }]}>
            {slot.error}
          </Text>
        ) : null}
        {slot.uploading ? (
          <View style={styles.progressWrap}>
            <View style={[styles.progressTrack, { backgroundColor: muted }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${slot.progress}%`, backgroundColor: primary },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: mutedFg }]}>
              {uploadingLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.docActions}>
        <Pressable
          onPress={onPick}
          disabled={slot.uploading}
          style={[
            styles.thumbBtn,
            { borderColor: ready ? primary : border, backgroundColor: muted },
          ]}
        >
          {slot.localUri ? (
            <Image source={{ uri: slot.localUri }} style={styles.thumb} />
          ) : (
            <Feather name="upload" size={20} color={primary} />
          )}
          {ready ? (
            <View style={[styles.checkBadge, { backgroundColor: primary }]}>
              <Feather name="check" size={12} color="#ffffff" />
            </View>
          ) : null}
        </Pressable>
        <View style={styles.actionLabels}>
          <Text
            onPress={slot.uploading ? undefined : onPick}
            style={[styles.linkText, { color: primary }]}
          >
            {slot.localUri ? replaceLabel : pickLabel}
          </Text>
          {slot.localUri ? (
            <Text
              onPress={onRemove}
              style={[styles.linkText, { color: destructive }]}
            >
              {removeLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroIcon: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 6,
  },
  heroDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 21,
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    marginBottom: 6,
    textAlign: "right",
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  errorText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
    marginBottom: 6,
  },
  sectionDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 21,
    marginBottom: 12,
  },
  docRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  docInfo: { flex: 1 },
  docLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  docDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    marginTop: 2,
    lineHeight: 18,
  },
  docError: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  docActions: {
    alignItems: "center",
    gap: 6,
    width: 88,
  },
  thumbBtn: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  thumb: { width: "100%", height: "100%", resizeMode: "cover" },
  checkBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  actionLabels: { alignItems: "center", gap: 4 },
  linkText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  progressWrap: { marginTop: 6, gap: 4 },
  progressTrack: {
    height: 4,
    borderRadius: 4,
    overflow: "hidden",
    width: "100%",
  },
  progressFill: { height: "100%" },
  progressLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
    textAlign: "right",
  },
  commissionHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  lockedNote: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    textAlign: "right",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    lineHeight: 18,
  },
  checkRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    flex: 1,
    textAlign: "right",
  },
});
