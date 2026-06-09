import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { TimeField } from "@/components/ui/TimeField";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  createUnavailablePeriod,
  deleteUnavailablePeriod,
  fetchProviderByOwner,
  fetchProviderUnavailablePeriods,
  type Provider,
  type UnavailablePeriod,
} from "@/lib/data";
import { confirmDialog, infoDialog } from "@/lib/dialog";
import { formatDate, formatTimeCompact } from "@/lib/format";
import { useT } from "@/lib/i18n";

/**
 * Provider-side: manage manual "blocked" windows so that external bookings
 * (events the provider sold outside the platform) stop the booking form
 * from offering the same hall/photographer to a customer here.
 *
 * Blocks are stored per-service (NULL service = blocks everything the
 * provider sells, e.g. provider is on vacation). The customer booking
 * form reads them through `service_busy_intervals` so the busy windows
 * are merged with real bookings before slot generation.
 */
export default function UnavailableManagerScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t, lang } = useT();
  const { profile } = useAuth();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<UnavailablePeriod[]>([]);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const p = await fetchProviderByOwner(profile.id, lang);
      if (!p) return;
      setProvider(p);
      const list = await fetchProviderUnavailablePeriods(p.id);
      setPeriods(list);
    } catch (e) {
      console.warn("[unavailable] reload failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [profile?.id]);

  const upcoming = useMemo(
    () => periods.filter((p) => p.endAt > new Date()),
    [periods],
  );
  const past = useMemo(
    () => periods.filter((p) => p.endAt <= new Date()),
    [periods],
  );

  const onDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: t("unavailableDeleteTitle"),
      message: t("unavailableDeleteBody"),
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await deleteUnavailablePeriod(id);
      setPeriods((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      const msg = (e as Error)?.message ?? t("unavailableDeleteFailed");
      await infoDialog({ title: t("error"), message: msg });
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title={t("manageUnavailable")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      </View>
    );
  }

  if (!provider) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title={t("manageUnavailable")} />
        <View style={{ padding: 24 }}>
          <Text style={{ color: c.foreground }}>{t("providerNotFound")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("manageUnavailable")} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96, gap: 12 }}
      >
        <Card>
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("manageUnavailableHelpTitle")}
          </Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>
            {t("manageUnavailableHelpBody")}
          </Text>
        </Card>

        <Button
          label={t("addBlockedWindow")}
          icon={<Feather name="plus" size={16} color="#ffffff" />}
          onPress={() => setOpen(true)}
        />

        {upcoming.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={t("noUnavailableTitle")}
            description={t("noUnavailableBody")}
          />
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={[styles.section, { color: c.foreground }]}>
              {t("unavailableUpcoming")}
            </Text>
            {upcoming.map((p) => (
              <PeriodRow
                key={p.id}
                period={p}
                lang={lang as "ar" | "en"}
                allLabel={t("allServices")}
                onDelete={() => onDelete(p.id)}
              />
            ))}
          </View>
        )}

        {past.length > 0 ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Text style={[styles.section, { color: c.mutedForeground }]}>
              {t("unavailablePast")}
            </Text>
            {past.slice(0, 5).map((p) => (
              <PeriodRow
                key={p.id}
                period={p}
                lang={lang as "ar" | "en"}
                allLabel={t("allServices")}
                onDelete={() => onDelete(p.id)}
                muted
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <AddBlockModal
        visible={open}
        provider={provider}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          reload();
        }}
      />
    </View>
  );
}

function PeriodRow({
  period,
  lang,
  allLabel,
  onDelete,
  muted,
}: {
  period: UnavailablePeriod;
  lang: "ar" | "en";
  allLabel: string;
  onDelete: () => void;
  muted?: boolean;
}) {
  const c = useColors();
  const fullDay =
    period.startAt.getHours() === 0 &&
    period.startAt.getMinutes() === 0 &&
    period.endAt.getHours() === 23 &&
    period.endAt.getMinutes() >= 59;

  return (
    <Card style={{ opacity: muted ? 0.6 : 1 }}>
      <View style={styles.rowHead}>
        <View
          style={[styles.iconWrap, { backgroundColor: c.primaryBg }]}
        >
          <Feather name="slash" size={16} color={c.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: c.foreground }]}>
            {period.serviceTitle ?? allLabel}
          </Text>
          <Text style={[styles.rowDate, { color: c.mutedForeground }]}>
            {formatDate(period.startAt, lang)}
          </Text>
          <Text style={[styles.rowTime, { color: c.mutedForeground }]}>
            {fullDay
              ? lang === "en"
                ? "All day"
                : "اليوم كامل"
              : `${formatTimeCompact(period.startAt, lang)} – ${formatTimeCompact(period.endAt, lang)}`}
          </Text>
          {period.reason ? (
            <Text style={[styles.rowReason, { color: c.mutedForeground }]}>
              {period.reason}
            </Text>
          ) : null}
        </View>
        {!muted ? (
          <Pressable hitSlop={8} onPress={onDelete}>
            <Feather name="trash-2" size={18} color={c.destructive} />
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

interface AddBlockModalProps {
  visible: boolean;
  provider: Provider;
  onClose: () => void;
  onSaved: () => void;
}

function AddBlockModal({ visible, provider, onClose, onSaved }: AddBlockModalProps) {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();

  const [serviceId, setServiceId] = useState<string | null>(null); // null = all
  const [dayIso, setDayIso] = useState<string>("");
  // 24-hour HH:MM
  const [startTime, setStartTime] = useState<string>("00:00");
  const [endTime, setEndTime] = useState<string>("23:59");
  const [fullDay, setFullDay] = useState(true);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Reset form on each open.
    setServiceId(null);
    setDayIso("");
    setStartTime("00:00");
    setEndTime("23:59");
    setFullDay(true);
    setReason("");
  }, [visible]);

  const save = async () => {
    if (!dayIso) {
      await infoDialog({ title: t("required"), message: t("pickDateFirst") });
      return;
    }
    const [y, m, d] = dayIso.split("-").map(Number);
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startAt = new Date(y, m - 1, d, fullDay ? 0 : sh, fullDay ? 0 : sm, 0);
    const endAt = new Date(y, m - 1, d, fullDay ? 23 : eh, fullDay ? 59 : em, 0);
    if (endAt <= startAt) {
      await infoDialog({
        title: t("error"),
        message: t("invalidTimeRange"),
      });
      return;
    }
    setSaving(true);
    try {
      await createUnavailablePeriod({
        providerId: provider.id,
        serviceId,
        startAt,
        endAt,
        reason,
      });
      onSaved();
    } catch (e) {
      const msg = (e as Error)?.message ?? t("unavailableSaveFailed");
      await infoDialog({ title: t("error"), message: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: c.background,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <View style={styles.modalHead}>
            <Text style={[styles.modalTitle, { color: c.foreground }]}>
              {t("addBlockedWindow")}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={c.foreground} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 12 }}>
            <Text style={[styles.label, { color: c.foreground }]}>
              {t("scopeLabel")}
            </Text>
            <View style={styles.scopeRow}>
              <Pressable
                onPress={() => setServiceId(null)}
                style={[
                  styles.scopeChip,
                  {
                    backgroundColor: serviceId === null ? c.primary : c.card,
                    borderColor: serviceId === null ? c.primary : c.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: serviceId === null ? "#ffffff" : c.foreground,
                    fontFamily: "Cairo_700Bold",
                    fontSize: 12,
                  }}
                >
                  {t("allServices")}
                </Text>
              </Pressable>
              {provider.services.map((s) => {
                const active = serviceId === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setServiceId(s.id)}
                    style={[
                      styles.scopeChip,
                      {
                        backgroundColor: active ? c.primary : c.card,
                        borderColor: active ? c.primary : c.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? "#ffffff" : c.foreground,
                        fontFamily: "Cairo_500Medium",
                        fontSize: 12,
                      }}
                      numberOfLines={1}
                    >
                      {s.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: c.foreground }]}>
              {t("pickDate")}
            </Text>
            <Calendar value={dayIso} onChange={setDayIso} />

            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: c.foreground }]}>
                {t("fullDayBlock")}
              </Text>
              <Pressable
                onPress={() => setFullDay((v) => !v)}
                style={[
                  styles.toggle,
                  {
                    backgroundColor: fullDay ? c.primary : c.muted,
                  },
                ]}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    { transform: [{ translateX: fullDay ? 18 : 0 }] },
                  ]}
                />
              </Pressable>
            </View>

            {!fullDay ? (
              <View style={{ gap: 10 }}>
                <View>
                  <Text style={[styles.label, { color: c.foreground, marginTop: 0, marginBottom: 6 }]}>
                    {t("startTime")}
                  </Text>
                  <TimeField value={startTime} onChange={setStartTime} />
                </View>
                <View>
                  <Text style={[styles.label, { color: c.foreground, marginTop: 0, marginBottom: 6 }]}>
                    {t("endTime")}
                  </Text>
                  <TimeField value={endTime} onChange={setEndTime} />
                </View>
              </View>
            ) : null}

            <Input
              label={t("reasonOptional")}
              value={reason}
              onChangeText={setReason}
              placeholder={t("reasonPlaceholder")}
            />
          </ScrollView>

          <View style={{ gap: 8 }}>
            <Button label={t("save")} onPress={save} loading={saving} />
            <Button label={t("cancel")} variant="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
    marginBottom: 4,
  },
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 20,
  },
  section: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    textAlign: "right",
    marginTop: 8,
  },
  rowHead: {
    flexDirection: "row-reverse",
    gap: 12,
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  rowDate: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  rowTime: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
  },
  rowReason: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
    fontStyle: "italic",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    gap: 8,
  },
  modalHead: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
  },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    textAlign: "right",
    marginTop: 4,
  },
  scopeRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1.5,
    maxWidth: 200,
  },
  toggleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  toggleLabel: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  toggle: {
    width: 42,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ffffff",
  },
  help: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    textAlign: "right",
  },
});
