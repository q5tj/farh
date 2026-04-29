import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Gender,
  isPhone,
  LangCode,
  useAuth,
} from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";
import {
  getPushPermissionStatus,
  isPushSupported,
  registerPushAsync,
  requestPushPermission,
} from "@/lib/push";
import {
  uploadImage,
  UploadCancelledError,
  type UploadJob,
} from "@/lib/image-upload";

export default function ProfileSetupScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { profile, session, updateProfile, signOut } = useAuth();
  const { t, isRtl } = useT();

  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile?.avatarUrl ?? null,
  );
  const [gender, setGender] = useState<Gender | null>(profile?.gender ?? null);
  const [age, setAge] = useState(
    profile?.age != null ? String(profile.age) : "",
  );
  const [language, setLanguage] = useState<LangCode>(profile?.language ?? "ar");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const uploadJobRef = useRef<UploadJob | null>(null);
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const onPickImage = async () => {
    setError("");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t("imagePermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    if (!session?.user.id) {
      setError(t("noUserId"));
      return;
    }
    setUploading(true);
    setUploadPct(0);
    const asset = result.assets[0];
    const job = uploadImage({
      uri: asset.uri,
      bucket: "avatars",
      authUserId: session.user.id,
      fileName: "avatar",
      withPublicUrl: true,
      compress: { maxWidth: 512, quality: 0.8 },
      onProgress: (pct) => setUploadPct(Math.round(pct * 100)),
    });
    uploadJobRef.current = job;
    try {
      const { publicUrl } = await job.promise;
      setAvatarUrl(publicUrl);
    } catch (e) {
      if (e instanceof UploadCancelledError) {
        setError(t("uploadCancelled"));
      } else {
        const msg = (e as Error)?.message ?? "";
        setError(msg || t("uploadFailed"));
      }
    } finally {
      setUploading(false);
      uploadJobRef.current = null;
    }
  };

  const onCancelUpload = () => {
    uploadJobRef.current?.cancel();
  };

  const onSubmit = async () => {
    setError("");
    const name = fullName.trim();
    const phoneClean = phone.replace(/\D/g, "");
    const ageNum = Number(age);

    if (!name) {
      setError(t("fillAllRequired"));
      return;
    }
    if (!isPhone(phoneClean)) {
      setError(t("invalidPhone"));
      return;
    }
    if (!gender) {
      setError(t("fillAllRequired"));
      return;
    }
    if (!ageNum || ageNum < 1 || ageNum > 120) {
      setError(t("invalidAge"));
      return;
    }

    setSubmitting(true);
    try {
      await updateProfile({
        fullName: name,
        phone: phoneClean,
        avatarUrl,
        gender,
        age: ageNum,
        language,
      });
      // Show the push permission prompt (skipped on web, simulators, and
      // Expo Go since `expo-notifications` no longer supports remote push there).
      if (isPushSupported) {
        const status = await getPushPermissionStatus();
        if (status === "undetermined") {
          setPushPromptOpen(true);
        }
      }
      // AuthGate redirects to (tabs) once profile_completed flips true
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setError(msg || t("profileSaveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const onAcceptPush = async () => {
    if (!profile?.id) {
      setPushPromptOpen(false);
      return;
    }
    setPushBusy(true);
    try {
      const status = await requestPushPermission();
      if (status === "granted") {
        await registerPushAsync(profile.id);
      }
    } finally {
      setPushBusy(false);
      setPushPromptOpen(false);
    }
  };

  const align = isRtl ? ("right" as const) : ("left" as const);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAwareScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: isWeb ? 60 : insets.top + 20,
          paddingBottom: insets.bottom + 30,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <LinearGradient
          colors={["#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {profile?.profileCompleted ? (
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace("/(tabs)");
              }}
              style={styles.heroBack}
            >
              <Feather
                name={isRtl ? "chevron-right" : "chevron-left"}
                size={22}
                color="#ffffff"
              />
            </Pressable>
          ) : null}
          <Text style={styles.title}>{t("profileSetupTitle")}</Text>
          <Text style={styles.subtitle}>{t("profileSetupDesc")}</Text>
        </LinearGradient>

        <View style={styles.body}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <Pressable onPress={onPickImage} disabled={uploading}>
              <View
                style={[
                  styles.avatar,
                  { borderColor: c.primary, backgroundColor: c.muted },
                ]}
              >
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <Feather name="camera" size={28} color={c.primary} />
                )}
              </View>
            </Pressable>
            <Text style={[styles.avatarLabel, { color: c.mutedForeground }]}>
              {uploading
                ? t("uploadingPercent", { percent: uploadPct })
                : avatarUrl
                  ? t("changeImage")
                  : t("pickImage")}
            </Text>
            {uploading ? (
              <View style={styles.progressWrap}>
                <View
                  style={[styles.progressTrack, { backgroundColor: c.muted }]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${uploadPct}%`, backgroundColor: c.primary },
                    ]}
                  />
                </View>
                <Pressable onPress={onCancelUpload} hitSlop={8}>
                  <Text style={[styles.cancelLink, { color: c.destructive }]}>
                    {t("uploadCancel")}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={{ marginTop: 14 }}>
            <Input
              label={t("fullNameLabel")}
              value={fullName}
              onChangeText={(v) => {
                setFullName(v);
                setError("");
              }}
              autoCapitalize="words"
              maxLength={80}
            />
          </View>

          <View style={{ marginTop: 14 }}>
            <Input
              label={t("phoneLabel")}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                setError("");
              }}
              keyboardType="phone-pad"
              maxLength={14}
              placeholder={t("phonePlaceholder")}
            />
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={[styles.fieldLabel, { color: c.foreground, textAlign: align }]}>
              {t("genderLabel")}
            </Text>
            <View
              style={[
                styles.choiceRow,
                { flexDirection: isRtl ? "row-reverse" : "row" },
              ]}
            >
              <ChoiceBtn
                label={t("genderMale")}
                active={gender === "male"}
                onPress={() => setGender("male")}
              />
              <ChoiceBtn
                label={t("genderFemale")}
                active={gender === "female"}
                onPress={() => setGender("female")}
              />
            </View>
          </View>

          <View style={{ marginTop: 14 }}>
            <Input
              label={t("ageLabel")}
              value={age}
              onChangeText={(v) => {
                setAge(v.replace(/\D/g, "").slice(0, 3));
                setError("");
              }}
              keyboardType="number-pad"
              maxLength={3}
              placeholder={t("agePlaceholder")}
            />
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={[styles.fieldLabel, { color: c.foreground, textAlign: align }]}>
              {t("preferredLanguageLabel")}
            </Text>
            <View
              style={[
                styles.choiceRow,
                { flexDirection: isRtl ? "row-reverse" : "row" },
              ]}
            >
              <ChoiceBtn
                label={t("arabic")}
                active={language === "ar"}
                onPress={() => setLanguage("ar")}
              />
              <ChoiceBtn
                label={t("english")}
                active={language === "en"}
                onPress={() => setLanguage("en")}
              />
            </View>
          </View>

          {error ? (
            <Text style={[styles.error, { color: c.destructive }]}>
              {error}
            </Text>
          ) : null}

          <View style={{ marginTop: 24 }}>
            <Button
              label={t("saveAndContinue")}
              onPress={onSubmit}
              loading={submitting}
              size="lg"
            />
          </View>

          <Pressable onPress={signOut} style={{ marginTop: 16 }}>
            <Text style={[styles.logoutLink, { color: c.mutedForeground }]}>
              {t("logout")}
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>

      {/* Push permission opt-in */}
      <Modal
        visible={pushPromptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !pushBusy && setPushPromptOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: c.background, borderRadius: c.radius },
            ]}
          >
            <View
              style={[styles.modalIcon, { backgroundColor: c.primaryBg }]}
            >
              <Feather name="bell" size={28} color={c.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: c.foreground }]}>
              تفعيل الإشعارات؟
            </Text>
            <Text style={[styles.modalDesc, { color: c.mutedForeground }]}>
              نرسل لك إشعار فور تحديث حالة حجوزاتك أو وصول طلب جديد. يمكنك
              تعطيلها في أي وقت من "حسابي".
            </Text>
            <View style={{ marginTop: 18, gap: 10 }}>
              <Button
                label="تفعيل الإشعارات"
                onPress={onAcceptPush}
                loading={pushBusy}
                size="lg"
              />
              <Button
                label="لاحقاً"
                onPress={() => !pushBusy && setPushPromptOpen(false)}
                variant="ghost"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChoiceBtn({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceBtn,
        {
          backgroundColor: active ? c.primary : c.muted,
          opacity: pressed ? 0.85 : 1,
          borderRadius: c.radius - 4,
        },
      ]}
    >
      <Text
        style={[
          styles.choiceBtnText,
          { color: active ? "#ffffff" : c.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heroBack: {
    position: "absolute",
    top: 24,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    padding: 24,
  },
  modalIcon: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 6,
  },
  modalDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 22,
  },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 40,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: "center",
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    color: "#ffffff",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: 6,
    textAlign: "center",
  },
  body: { padding: 20 },
  avatarWrap: { alignItems: "center", marginTop: -50, marginBottom: 8 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    marginTop: 8,
  },
  progressWrap: {
    width: 200,
    marginTop: 10,
    alignItems: "center",
    gap: 6,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  cancelLink: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  fieldLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    marginBottom: 8,
    textAlign: "right",
  },
  choiceRow: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  choiceBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  choiceBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
  },
  error: {
    marginTop: 14,
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
  logoutLink: {
    textAlign: "center",
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
  },
});
