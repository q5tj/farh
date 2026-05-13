import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { fetchProviderByOwner, updateOwnProvider } from "@/lib/data";
import { infoDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import {
  uploadImage,
  UploadCancelledError,
  type UploadJob,
} from "@/lib/image-upload";

/**
 * Store profile editor for the provider — name, logo, cover and description.
 * This is the provider's *store* data; personal data lives in /profile-setup.
 */
export default function StoreInfoScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile, session } = useAuth();
  const lang = profile?.language ?? "ar";
  const userDbId = profile?.id ?? null;
  const authUserId = session?.user.id ?? null;
  const providerId = profile?.providerId ?? null;
  const { refresh: refreshAppCatalog } = useApp();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPct, setLogoPct] = useState(0);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverPct, setCoverPct] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const logoJobRef = useRef<UploadJob | null>(null);
  const coverJobRef = useRef<UploadJob | null>(null);

  useEffect(() => {
    return () => {
      logoJobRef.current?.cancel();
      coverJobRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!userDbId) {
      setLoading(false);
      return;
    }
    let alive = true;
    fetchProviderByOwner(userDbId, lang)
      .then((p) => {
        if (!alive || !p) return;
        setName(p.nameAr || p.name || "");
        setNameEn(p.nameEn || "");
        setDescription(p.description ?? "");
        setDescriptionEn(p.descriptionEn ?? "");
        setLogoUrl(p.logoUrl);
        setCoverUrl(p.coverUrl);
      })
      .catch((e) => console.warn("[store-info] load failed", e))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userDbId, lang]);

  const onPickLogo = async () => {
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
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    setLogoUploading(true);
    setLogoPct(0);
    const job = uploadImage({
      uri: result.assets[0].uri,
      bucket: "provider-logos",
      authUserId,
      fileName: "logo",
      withPublicUrl: true,
      compress: { maxWidth: 800, quality: 0.8 },
      onProgress: (p) => setLogoPct(Math.round(p * 100)),
    });
    logoJobRef.current = job;
    try {
      const { publicUrl } = await job.promise;
      setLogoUrl(publicUrl ?? null);
    } catch (e) {
      if (!(e instanceof UploadCancelledError)) {
        const msg = (e as Error)?.message ?? "";
        setError(msg || t("uploadFailed"));
      }
    } finally {
      setLogoUploading(false);
      logoJobRef.current = null;
    }
  };

  const onPickCover = async () => {
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
      aspect: [16, 9],
    });
    if (result.canceled || !result.assets[0]) return;
    setCoverUploading(true);
    setCoverPct(0);
    const job = uploadImage({
      uri: result.assets[0].uri,
      bucket: "provider-media",
      authUserId,
      fileName: `cover-${Date.now()}`,
      withPublicUrl: true,
      compress: { maxWidth: 1600, quality: 0.78 },
      onProgress: (p) => setCoverPct(Math.round(p * 100)),
    });
    coverJobRef.current = job;
    try {
      const { publicUrl } = await job.promise;
      setCoverUrl(publicUrl ?? null);
    } catch (e) {
      if (!(e instanceof UploadCancelledError)) {
        const msg = (e as Error)?.message ?? "";
        setError(msg || t("uploadFailed"));
      }
    } finally {
      setCoverUploading(false);
      coverJobRef.current = null;
    }
  };

  const onSave = async () => {
    if (!providerId) return;
    if (!name.trim()) {
      setError(t("enterBusinessName"));
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await updateOwnProvider(providerId, {
        name: name.trim(),
        nameEn: nameEn.trim(),
        description: description.trim() || undefined,
        descriptionEn: descriptionEn.trim(),
        logoUrl,
        coverUrl,
      });
      refreshAppCatalog().catch(() => {});
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
      await infoDialog({ title: t("done"), message: t("storeDataSaved") });
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setError(msg || t("storeDataSaveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("storeInfoTitle")}
        subtitle={t("storeInfoDesc")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/provider-zone");
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
          <Text style={[styles.fieldLabel, { color: c.foreground }]}>
            {t("storeCoverLabel")}
          </Text>
          <Pressable
            onPress={onPickCover}
            disabled={coverUploading}
            style={[
              styles.coverFrame,
              {
                borderColor: coverUrl ? c.primary : c.border,
                backgroundColor: c.muted,
              },
            ]}
          >
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.coverImage} />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Feather name="image" size={32} color={c.primary} />
                <Text
                  style={[styles.coverHintText, { color: c.mutedForeground }]}
                >
                  {t("storeCoverHint")}
                </Text>
              </View>
            )}
            {coverUploading ? (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#ffffff" />
                <Text style={styles.uploadOverlayText}>
                  {t("uploadingPercent", { percent: coverPct })}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={onPickCover}
            disabled={coverUploading}
            style={styles.miniBtnRow}
          >
            <Feather
              name={coverUrl ? "refresh-cw" : "upload"}
              size={14}
              color={c.primary}
            />
            <Text style={[styles.miniBtnText, { color: c.primary }]}>
              {coverUrl ? t("replaceCoverImage") : t("pickCoverImage")}
            </Text>
          </Pressable>
        </Card>

        <Card>
          <View style={styles.logoRow}>
            <Pressable
              onPress={onPickLogo}
              disabled={logoUploading}
              style={[
                styles.logoFrame,
                { borderColor: c.primary, backgroundColor: c.muted },
              ]}
            >
              {logoUrl ? (
                <Image
                  source={{ uri: logoUrl }}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <Feather name="image" size={28} color={c.primary} />
              )}
              {logoUploading ? (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator color="#ffffff" size="small" />
                  <Text style={styles.uploadOverlayTextSmall}>{logoPct}%</Text>
                </View>
              ) : null}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: c.foreground }]}>
                {t("storeLogoLabel")}
              </Text>
              <Pressable
                onPress={onPickLogo}
                disabled={logoUploading}
                style={styles.miniBtnRow}
              >
                <Feather
                  name={logoUrl ? "refresh-cw" : "upload"}
                  size={14}
                  color={c.primary}
                />
                <Text style={[styles.miniBtnText, { color: c.primary }]}>
                  {logoUrl ? t("replaceImage") : t("pickImage")}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={{ marginTop: 16 }}>
            <Input
              label={t("businessNameAr")}
              placeholder={t("storeNameExample")}
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
          </View>
          <View style={{ marginTop: 12 }}>
            <Input
              label={t("businessNameEn")}
              placeholder={t("businessNameEnExample")}
              value={nameEn}
              onChangeText={setNameEn}
              maxLength={80}
            />
          </View>

          <View style={{ marginTop: 12 }}>
            <Input
              label={t("shortBioAr")}
              placeholder={t("storeDescriptionPlaceholder")}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              style={{ height: 110, textAlignVertical: "top" }}
              maxLength={500}
            />
          </View>
          <View style={{ marginTop: 12 }}>
            <Input
              label={t("shortBioEn")}
              placeholder={t("shortBioEnPlaceholder")}
              value={descriptionEn}
              onChangeText={setDescriptionEn}
              multiline
              numberOfLines={4}
              style={{ height: 110, textAlignVertical: "top" }}
              maxLength={500}
            />
          </View>
        </Card>

        {error ? (
          <Text style={[styles.errorText, { color: c.destructive }]}>
            {error}
          </Text>
        ) : null}

        <Button
          label={savedFlash ? t("storeDataSaved") : t("saveStoreData")}
          onPress={onSave}
          loading={submitting}
          variant={savedFlash ? "secondary" : "primary"}
          size="lg"
          icon={
            savedFlash ? (
              <Feather name="check" size={16} color="#ffffff" />
            ) : (
              <Feather name="save" size={16} color="#ffffff" />
            )
          }
        />

        <View style={{ marginTop: 8, gap: 10 }}>
          <NavTile
            icon="clock"
            title={t("workingHoursTitle")}
            desc={t("workingHoursDesc")}
            onPress={() => router.push("/provider-zone/availability")}
            primary={c.primary}
            primaryBg={c.primaryBg}
            foreground={c.foreground}
            mutedFg={c.mutedForeground}
          />
          <NavTile
            icon="image"
            title={t("galleryManageTitle")}
            desc={t("galleryManageDesc")}
            onPress={() => router.push("/provider-zone/gallery")}
            primary={c.primary}
            primaryBg={c.primaryBg}
            foreground={c.foreground}
            mutedFg={c.mutedForeground}
          />
          <NavTile
            icon="map-pin"
            title={t("serviceAreasTitle")}
            desc={t("serviceAreasDesc")}
            onPress={() => router.push("/provider-zone/service-areas")}
            primary={c.primary}
            primaryBg={c.primaryBg}
            foreground={c.foreground}
            mutedFg={c.mutedForeground}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

interface NavTileProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  desc: string;
  onPress: () => void;
  primary: string;
  primaryBg: string;
  foreground: string;
  mutedFg: string;
}

function NavTile({
  icon,
  title,
  desc,
  onPress,
  primary,
  primaryBg,
  foreground,
  mutedFg,
}: NavTileProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card>
        <View style={styles.navRow}>
          <View style={[styles.navIcon, { backgroundColor: primaryBg }]}>
            <Feather name={icon} size={22} color={primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.navTitle, { color: foreground }]}>{title}</Text>
            <Text style={[styles.navDesc, { color: mutedFg }]}>{desc}</Text>
          </View>
          <Feather name="chevron-left" size={20} color={mutedFg} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
    marginBottom: 8,
  },
  coverFrame: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  coverImage: { width: "100%", height: "100%" },
  coverPlaceholder: { alignItems: "center", gap: 8, padding: 16 },
  coverHintText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    textAlign: "center",
  },
  miniBtnRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    alignSelf: "flex-end",
  },
  miniBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  logoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
  },
  logoFrame: {
    width: 80,
    height: 80,
    borderRadius: 18,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
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
  uploadOverlayTextSmall: {
    color: "#ffffff",
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
  },
  errorText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
  },
  navRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  navIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  navDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 3,
    textAlign: "right",
  },
});
