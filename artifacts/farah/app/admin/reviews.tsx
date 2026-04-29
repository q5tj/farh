import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Stars } from "@/components/ui/Stars";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  adminFetchReviews,
  adminSetReviewHidden,
  type ReviewWithContext,
} from "@/lib/data";
import { useT } from "@/lib/i18n";

type Tab = "all" | "visible" | "hidden";

export default function AdminReviewsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();
  const lang = profile?.language ?? "ar";

  const [tab, setTab] = useState<Tab>("visible");
  const [reviews, setReviews] = useState<ReviewWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hideTarget, setHideTarget] = useState<ReviewWithContext | null>(null);
  const [hideReason, setHideReason] = useState("");

  const load = async () => {
    try {
      const list = await adminFetchReviews(tab, lang);
      setReviews(list);
    } catch (e) {
      console.warn("[admin reviews] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, lang]);

  const tabs = useMemo(
    () => [
      { id: "visible" as Tab, labelKey: "filterReviewsVisible" as const },
      { id: "hidden" as Tab, labelKey: "filterReviewsHidden" as const },
      { id: "all" as Tab, labelKey: "filterReviewsAll" as const },
    ],
    [],
  );

  const onUnhide = async (r: ReviewWithContext) => {
    setBusyId(r.id);
    try {
      await adminSetReviewHidden(r.id, false);
      await load();
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (Platform.OS !== "web") Alert.alert(t("error"), msg);
      else if (typeof window !== "undefined") window.alert(msg);
    } finally {
      setBusyId(null);
    }
  };

  const submitHide = async () => {
    if (!hideTarget) return;
    setBusyId(hideTarget.id);
    try {
      await adminSetReviewHidden(hideTarget.id, true, hideReason.trim());
      setHideTarget(null);
      setHideReason("");
      await load();
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (Platform.OS !== "web") Alert.alert(t("error"), msg);
      else if (typeof window !== "undefined") window.alert(msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("adminReviews")} />

      <View style={[styles.tabsBar, { borderBottomColor: c.border }]}>
        {tabs.map((tb) => {
          const active = tab === tb.id;
          return (
            <Pressable
              key={tb.id}
              onPress={() => setTab(tb.id)}
              style={[
                styles.tabBtn,
                { borderBottomColor: active ? c.primary : "transparent" },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: active ? c.primary : c.mutedForeground,
                    fontFamily: active ? "Cairo_700Bold" : "Cairo_500Medium",
                  },
                ]}
              >
                {t(tb.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : reviews.length === 0 ? (
        <EmptyState icon="star" title={t("noReviewsToModerate")} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 12,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={c.primary}
            />
          }
        >
          {reviews.map((r) => (
            <ReviewRow
              key={r.id}
              review={r}
              busy={busyId === r.id}
              onHide={() => {
                setHideReason("");
                setHideTarget(r);
              }}
              onUnhide={() => onUnhide(r)}
            />
          ))}
        </ScrollView>
      )}

      <Modal
        visible={hideTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => !busyId && setHideTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalContainer}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.modalCard,
                { backgroundColor: c.background, borderRadius: c.radius },
              ]}
            >
              <Text style={[styles.modalTitle, { color: c.foreground }]}>
                {t("hideReviewConfirm")}
              </Text>
              <Input
                label={t("hideReviewReason")}
                value={hideReason}
                onChangeText={setHideReason}
                multiline
                numberOfLines={3}
                style={{ height: 90, textAlignVertical: "top" }}
                maxLength={300}
              />
              <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("hideReview")}
                    onPress={submitHide}
                    loading={busyId !== null}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("cancel")}
                    variant="ghost"
                    onPress={() => !busyId && setHideTarget(null)}
                  />
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </View>
  );
}

function ReviewRow({
  review,
  busy,
  onHide,
  onUnhide,
}: {
  review: ReviewWithContext;
  busy: boolean;
  onHide: () => void;
  onUnhide: () => void;
}) {
  const c = useColors();
  const { t } = useT();
  return (
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Stars value={review.rating} size={14} />
          <Text style={[styles.author, { color: c.foreground }]}>
            {review.userName ?? "—"}
            {review.providerName ? (
              <Text style={{ color: c.mutedForeground }}>
                {"  •  "}
                {review.providerName}
              </Text>
            ) : null}
          </Text>
        </View>
        {review.isHidden ? (
          <View style={[styles.pill, { backgroundColor: "#fee2e2" }]}>
            <Text style={[styles.pillText, { color: "#991b1b" }]}>
              {t("reviewHidden")}
            </Text>
          </View>
        ) : null}
      </View>

      {review.comment ? (
        <Text
          style={[styles.comment, { color: c.foreground }]}
          numberOfLines={6}
        >
          {review.comment}
        </Text>
      ) : null}

      {review.isHidden && review.hiddenReason ? (
        <Text style={[styles.hiddenReason, { color: c.mutedForeground }]}>
          {t("hideReviewReason")}: {review.hiddenReason}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {review.isHidden ? (
          <Button
            label={t("unhideReview")}
            variant="secondary"
            loading={busy}
            onPress={onUnhide}
          />
        ) : (
          <Button
            label={t("hideReview")}
            variant="ghost"
            icon={<Feather name="eye-off" size={16} color={c.destructive} />}
            onPress={onHide}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tabsBar: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
  },
  tabText: { fontSize: 13 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  author: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    marginTop: 6,
    textAlign: "right",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  pillText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  comment: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    marginTop: 10,
    lineHeight: 21,
    textAlign: "right",
  },
  hiddenReason: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    marginTop: 8,
    textAlign: "right",
  },
  actions: {
    marginTop: 12,
    flexDirection: "row-reverse",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.6)",
  },
  modalContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    padding: 20,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
    marginBottom: 14,
  },
});
