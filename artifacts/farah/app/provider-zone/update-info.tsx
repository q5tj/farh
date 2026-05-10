import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
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
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  fetchProviderByOwner,
  providerResubmitForReview,
  updateOwnProvider,
} from "@/lib/data";
import { useT } from "@/lib/i18n";
import {
  uploadImage,
  UploadCancelledError,
  type UploadJob,
} from "@/lib/image-upload";

type DocKey = "logo" | "cr" | "tax" | "address";

interface DocSlot {
  localUri: string | null;
  path: string | null;
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

export default function UpdateInfoScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile, session, refreshProfile } = useAuth();
  const lang = profile?.language ?? "ar";
  const userDbId = profile?.id ?? null;
  const authUserId = session?.user.id ?? null;
  const reason = profile?.providerRejectionReason ?? null;
  const status = profile?.providerVerificationStatus ?? null;

  // Gate: this screen is only useful when status=needs_update.
  useEffect(() => {
    if (!profile) return;
    if (status === "approved") {
      router.replace("/provider-zone");
    } else if (status === "rejected") {
      router.replace("/provider-zone/pending");
    }
  }, [profile, status]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [slots, setSlots] = useState<Record<DocKey, DocSlot>>({
    logo: EMPTY_SLOT,
    cr: EMPTY_SLOT,
    tax: EMPTY_SLOT,
    address: EMPTY_SLOT,
  });

  // Pre-fill from current provider record.
  useEffect(() => {
    if (!userDbId) return;
    let alive = true;
    fetchProviderByOwner(userDbId, lang)
      .then((p) => {
        if (!alive || !p) return;
        setName(p.nameAr || p.name || "");
        setDescription(p.description ?? "");
        if (p.logoUrl) {
          setSlots((prev) => ({
            ...prev,
            logo: {
              ...prev.logo,
              publicUrl: p.logoUrl,
              path: null, // unchanged
              localUri: p.logoUrl,
            },
          }));
        }
        // Existing doc paths are kept as-is unless the user re-uploads.
      })
      .catch((e) => console.warn("[update-info] load failed", e));
    return () => {
      alive = false;
    };
  }, [userDbId, lang]);

  const jobsRef = useRef<Partial<Record<DocKey, UploadJob>>>({});

  useEffect(() => {
    return () => {
      Object.values(jobsRef.current).forEach((j) => j?.cancel());
    };
  }, []);

  const setSlot = (key: DocKey, patch: Partial<DocSlot>) => {
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const pickAndUpload = async (key: DocKey) => {
    setError("");
    if (!authUserId) return;

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
      authUserId,
      fileName: DOC_FILE_NAME[key],
      withPublicUrl: isLogo,
      compress:
        key === "logo"
          ? { maxWidth: 800, quality: 0.8 }
          : { maxWidth: 1800, quality: 0.7 },
      onProgress: (p) =>
        setSlot(key, { progress: Math.round(p * 100) }),
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

  const onResubmit = async () => {
    if (!profile?.providerId) return;
    if (!name.trim()) {
      setError(t("enterBusinessName"));
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      // 1) Update store fields (name + description + logo).
      await updateOwnProvider(profile.providerId, {
        name: name.trim(),
        description: description.trim() || undefined,
        // Only patch logo if the user re-uploaded it. publicUrl is set from
        // either the freshly-uploaded asset or the pre-fetched current one;
        // we only push when path is non-null (a new upload happened).
        logoUrl: slots.logo.path ? slots.logo.publicUrl : undefined,
      });

      // 2) Update doc paths if any were re-uploaded.
      // (We use a direct update on the providers table — the columns exist
      //  from migration v8.)
      const docPatch: Record<string, string> = {};
      if (slots.cr.path) docPatch.commercial_registration_path = slots.cr.path;
      if (slots.tax.path) docPatch.tax_number_path = slots.tax.path;
      if (slots.address.path) docPatch.national_address_path = slots.address.path;
      // We use updateOwnProvider's fields where possible; for doc paths we go
      // through Supabase directly. Use the same authenticated session.
      if (Object.keys(docPatch).length > 0) {
        const { supabase } = await import("@/lib/supabase");
        if (supabase) {
          const { error: docErr } = await supabase
            .from("providers")
            .update(docPatch)
            .eq("id", profile.providerId);
          if (docErr) throw docErr;
        }
      }

      // 3) Flip status back to pending.
      await providerResubmitForReview();

      // 4) Refresh profile so the AuthGate routes us correctly (the realtime
      //    notification will also flip status, but force the refresh to be
      //    instant on this device).
      await refreshProfile();

      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(t("resubmitDone"));
      } else {
        Alert.alert(t("done"), t("resubmitDone"));
      }
      router.replace("/provider-zone/pending");
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setError(msg || t("resubmitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("updateInfoTitle")}
        subtitle={t("updateInfoDesc")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/provider-zone/pending");
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
        {reason ? (
          <Card>
            <View style={styles.reasonHead}>
              <Feather name="alert-circle" size={18} color="#1d4ed8" />
              <Text style={[styles.reasonTitle, { color: c.foreground }]}>
                {t("needsUpdateReasonLabel")}
              </Text>
            </View>
            <Text style={[styles.reasonBody, { color: c.foreground }]}>
              {reason}
            </Text>
          </Card>
        ) : null}

        <Input
          label={t("storeNameLabel")}
          placeholder={t("storeNameExample")}
          value={name}
          onChangeText={setName}
          maxLength={80}
        />

        <Input
          label={t("storeDescriptionLabel")}
          placeholder={t("storeDescriptionPlaceholder")}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          style={{ height: 90, textAlignVertical: "top" }}
          maxLength={500}
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
            slot={slots.logo}
            onPick={() => pickAndUpload("logo")}
            t={t}
            primary={c.primary}
            border={c.border}
            muted={c.muted}
            mutedFg={c.mutedForeground}
            destructive={c.destructive}
          />
          <DocPicker
            label={t("commercialRegistration")}
            slot={slots.cr}
            onPick={() => pickAndUpload("cr")}
            t={t}
            primary={c.primary}
            border={c.border}
            muted={c.muted}
            mutedFg={c.mutedForeground}
            destructive={c.destructive}
          />
          <DocPicker
            label={t("taxNumber")}
            slot={slots.tax}
            onPick={() => pickAndUpload("tax")}
            t={t}
            primary={c.primary}
            border={c.border}
            muted={c.muted}
            mutedFg={c.mutedForeground}
            destructive={c.destructive}
          />
          <DocPicker
            label={t("nationalAddress")}
            slot={slots.address}
            onPick={() => pickAndUpload("address")}
            t={t}
            primary={c.primary}
            border={c.border}
            muted={c.muted}
            mutedFg={c.mutedForeground}
            destructive={c.destructive}
          />
        </Card>

        {error ? (
          <Text style={[styles.errorText, { color: c.destructive }]}>
            {error}
          </Text>
        ) : null}

        <Button
          label={t("resubmitForReview")}
          onPress={onResubmit}
          loading={submitting}
          size="lg"
          icon={<Feather name="send" size={16} color="#ffffff" />}
        />
      </KeyboardAwareScrollView>
    </View>
  );
}

interface DocPickerProps {
  label: string;
  slot: DocSlot;
  onPick: () => void;
  t: (k: never) => string;
  primary: string;
  border: string;
  muted: string;
  mutedFg: string;
  destructive: string;
}

function DocPicker({
  label,
  slot,
  onPick,
  primary,
  border,
  muted,
  mutedFg,
  destructive,
}: DocPickerProps) {
  const { t } = useT();
  const ready = !!slot.path && !slot.uploading;
  const hasExisting = !!slot.localUri && !slot.path;
  return (
    <View style={[styles.docRow, { borderColor: border }]}>
      <Pressable
        onPress={onPick}
        disabled={slot.uploading}
        style={[
          styles.thumbBtn,
          {
            borderColor: ready ? primary : border,
            backgroundColor: muted,
          },
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
      <View style={styles.docInfo}>
        <Text style={styles.docLabel}>{label}</Text>
        {slot.error ? (
          <Text style={[styles.docError, { color: destructive }]}>
            {slot.error}
          </Text>
        ) : slot.uploading ? (
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
              {slot.progress}%
            </Text>
          </View>
        ) : (
          <Text style={[styles.docHint, { color: mutedFg }]}>
            {ready
              ? t("uploadDoneReady")
              : hasExisting
                ? t("uploadTapToReplace")
                : t("uploadTapToUpload")}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reasonHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  reasonTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  reasonBody: {
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    textAlign: "right",
    lineHeight: 22,
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
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  thumbBtn: {
    width: 64,
    height: 64,
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
  docInfo: { flex: 1 },
  docLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    textAlign: "right",
  },
  docHint: {
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  docError: {
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
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
  errorText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
  },
});
