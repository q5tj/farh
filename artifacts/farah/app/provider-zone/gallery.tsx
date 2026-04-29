import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  addGalleryItem,
  fetchProviderGallery,
  GalleryItem,
  removeGalleryItem,
  type MediaKind,
} from "@/lib/data";
import { useT } from "@/lib/i18n";
import { uploadGalleryMedia } from "@/lib/image-upload";

export default function ProviderGalleryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile, session } = useAuth();
  const providerId = profile?.providerId ?? null;
  const authUserId = session?.user.id ?? null;

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<MediaKind | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!providerId) return;
    try {
      const list = await fetchProviderGallery(providerId);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const onAddImage = async () => {
    if (!authUserId || !providerId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t("imagePermissionDenied"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (res.canceled || !res.assets[0]) return;
    await runUpload({
      uri: res.assets[0].uri,
      kind: "image",
      mimeType: res.assets[0].mimeType,
    });
  };

  const onAddVideo = async () => {
    if (!authUserId || !providerId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t("imagePermissionDenied"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });
    if (res.canceled || !res.assets[0]) return;
    await runUpload({
      uri: res.assets[0].uri,
      kind: "video",
      mimeType: res.assets[0].mimeType,
    });
  };

  const onAddFile = async () => {
    if (!authUserId || !providerId) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    await runUpload({
      uri: asset.uri,
      kind: "file",
      mimeType: asset.mimeType ?? "application/octet-stream",
      fileExt: (asset.name?.split(".").pop() ?? "bin").toLowerCase(),
    });
  };

  const runUpload = async (input: {
    uri: string;
    kind: MediaKind;
    mimeType?: string | null;
    fileExt?: string;
  }) => {
    if (!authUserId || !providerId) return;
    setError(null);
    setBusyKind(input.kind);
    setProgress(0);

    const stem = `${Date.now()}`;
    const job = uploadGalleryMedia({
      uri: input.uri,
      kind: input.kind,
      authUserId,
      bucket: "provider-media",
      fileName: stem,
      mimeType: input.mimeType ?? undefined,
      fileExt: input.fileExt,
      onProgress: (p) => setProgress(Math.round(p * 100)),
    });

    try {
      const result = await job.promise;
      const created = await addGalleryItem({
        providerId,
        kind: result.kind,
        url: result.publicUrl,
        storagePath: result.path,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes || null,
        thumbnailUrl: result.thumbnailUrl ?? null,
      });
      setItems((prev) => [...prev, created]);
    } catch (e) {
      const msg = (e as Error)?.message ?? t("galleryUploadFailed");
      setError(msg);
      if (Platform.OS !== "web") Alert.alert(t("error"), msg);
    } finally {
      setBusyKind(null);
      setProgress(0);
    }
  };

  const onDelete = (item: GalleryItem) => {
    const run = async () => {
      try {
        await removeGalleryItem(item.id, [
          item.storagePath,
          // The thumbnail path lives in the same bucket; we can't reconstruct
          // it from the URL alone, so the trigger relies on best-effort
          // cleanup. For now we leave the orphan poster — Storage tooling can
          // sweep these later.
        ]);
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } catch (e) {
        const msg = (e as Error)?.message ?? "";
        if (Platform.OS !== "web") Alert.alert(t("error"), msg);
        else if (typeof window !== "undefined") window.alert(msg);
      }
    };
    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined" &&
        window.confirm(t("galleryDeleteConfirm"))
      ) {
        run();
      }
      return;
    }
    Alert.alert(t("galleryDeleteConfirm"), undefined, [
      { text: t("cancel"), style: "cancel" },
      { text: t("galleryDelete"), style: "destructive", onPress: run },
    ]);
  };

  if (!providerId) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader
          title={t("galleryManageTitle")}
          onBack={() => router.replace("/provider-zone")}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("galleryManageTitle")}
        subtitle={t("galleryManageDesc")}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/provider-zone");
        }}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          gap: 14,
        }}
      >
        <View style={styles.actionsRow}>
          <ActionTile
            label={t("galleryAddImage")}
            icon="image"
            busy={busyKind === "image"}
            onPress={onAddImage}
            tint={c.primary}
          />
          <ActionTile
            label={t("galleryAddVideo")}
            icon="video"
            busy={busyKind === "video"}
            onPress={onAddVideo}
            tint="#dc2626"
          />
          <ActionTile
            label={t("galleryAddFile")}
            icon="file-text"
            busy={busyKind === "file"}
            onPress={onAddFile}
            tint="#16a34a"
          />
        </View>

        {busyKind ? (
          <View style={[styles.progressBar, { backgroundColor: c.muted }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%`, backgroundColor: c.primary },
              ]}
            />
          </View>
        ) : null}

        {error ? (
          <Text style={[styles.errorText, { color: c.destructive }]}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <View style={{ paddingTop: 30, alignItems: "center" }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : items.length === 0 ? (
          <EmptyState icon="image" title={t("galleryEmpty")} />
        ) : (
          <View style={styles.grid}>
            {items.map((item) => (
              <GalleryTile key={item.id} item={item} onDelete={onDelete} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ActionTile({
  label,
  icon,
  busy,
  onPress,
  tint,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  busy: boolean;
  onPress: () => void;
  tint: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[
        styles.actionTile,
        { borderColor: c.border, backgroundColor: c.card },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tint} />
      ) : (
        <Feather name={icon} size={22} color={tint} />
      )}
      <Text style={[styles.actionLabel, { color: c.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function GalleryTile({
  item,
  onDelete,
}: {
  item: GalleryItem;
  onDelete: (item: GalleryItem) => void;
}) {
  const c = useColors();
  const { t } = useT();

  const onOpen = () => {
    if (Platform.OS === "web") {
      window.open?.(item.url, "_blank");
    } else {
      Linking.openURL(item.url).catch(() => {});
    }
  };

  return (
    <View style={[styles.tile, { borderColor: c.border, backgroundColor: c.card }]}>
      <Pressable onPress={onOpen} style={styles.tileMedia}>
        {item.kind === "image" ? (
          <Image source={{ uri: item.url }} style={styles.tileImage} />
        ) : item.kind === "video" ? (
          item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.tileImage} />
          ) : (
            <View style={[styles.tileFallback, { backgroundColor: c.muted }]}>
              <Feather name="video" size={28} color={c.primary} />
            </View>
          )
        ) : (
          <View style={[styles.tileFallback, { backgroundColor: c.muted }]}>
            <Feather name="file-text" size={28} color={c.primary} />
          </View>
        )}
        {item.kind === "video" ? (
          <View style={styles.playOverlay}>
            <Feather name="play" size={20} color="#ffffff" />
          </View>
        ) : null}
      </Pressable>
      <View style={styles.tileFooter}>
        <Text style={[styles.tileKind, { color: c.mutedForeground }]}>
          {item.kind === "image"
            ? t("galleryItemImage")
            : item.kind === "video"
              ? t("galleryItemVideo")
              : t("galleryItemFile")}
        </Text>
        <Pressable onPress={() => onDelete(item)} hitSlop={6}>
          <Feather name="trash-2" size={16} color={c.destructive} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  actionTile: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 8,
  },
  actionLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    textAlign: "center",
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%" },
  errorText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
  },
  grid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: "31.5%",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  tileMedia: {
    width: "100%",
    aspectRatio: 1,
    position: "relative",
  },
  tileImage: { width: "100%", height: "100%", resizeMode: "cover" },
  tileFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  playOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 36,
    height: 36,
    marginTop: -18,
    marginLeft: -18,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  tileFooter: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileKind: {
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
  },
});
