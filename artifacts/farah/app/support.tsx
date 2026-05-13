import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
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
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  createTicket,
  fetchUserTickets,
  type SupportTicket,
  type TicketStatus,
} from "@/lib/data";
import { infoDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";

const STATUS_COLORS: Record<TicketStatus, { bg: string; fg: string }> = {
  open: { bg: "#fef3c7", fg: "#a16207" },
  in_progress: { bg: "#dbeafe", fg: "#2563eb" },
  closed: { bg: "#dcfce7", fg: "#166534" },
};

export default function SupportScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { profile } = useAuth();

  const STATUS_LABEL: Record<TicketStatus, string> = {
    open: t("ticketStatusOpen"),
    in_progress: t("ticketStatusInProgress"),
    closed: t("ticketStatusClosed"),
  };

  const [tab, setTab] = useState<"new" | "list">("new");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!profile?.id) return;
    try {
      const list = await fetchUserTickets(profile.id);
      setTickets(list);
    } catch (e) {
      console.warn("[support] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const onSubmit = async () => {
    setError("");
    if (!subject.trim() || !message.trim()) {
      setError(t("supportSubjectRequired"));
      return;
    }
    if (!profile) return;
    setSubmitting(true);
    try {
      await createTicket({
        userId: profile.id,
        userRole: profile.role,
        userName: profile.fullName,
        userEmail: profile.email,
        userPhone: profile.phone,
        subject: subject.trim(),
        message: message.trim(),
      });
      setSubject("");
      setMessage("");
      setTab("list");
      await load();
      await infoDialog({ title: t("supportSentTitle"), message: t("supportSentDesc") });
    } catch (e) {
      const msg = (e as Error).message ?? t("supportSubmitFail");
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("support")} />
      <View style={[styles.tabsBar, { borderBottomColor: c.border }]}>
        <TabBtn
          label={t("supportNewTicket")}
          active={tab === "new"}
          onPress={() => setTab("new")}
        />
        <TabBtn
          label={t("supportMyTickets", { count: tickets.length })}
          active={tab === "list"}
          onPress={() => setTab("list")}
        />
      </View>

      {tab === "new" ? (
        <KeyboardAwareScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
        >
          <Card>
            <View style={styles.headerRow}>
              <View
                style={[styles.headerIcon, { backgroundColor: c.primaryBg }]}
              >
                <Feather name="help-circle" size={22} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: c.foreground }]}>
                  {t("supportHowCanWeHelp")}
                </Text>
                <Text
                  style={[styles.headerDesc, { color: c.mutedForeground }]}
                >
                  {t("supportDesc")}
                </Text>
              </View>
            </View>
          </Card>

          <Input
            label={t("supportSubject")}
            placeholder={t("supportSubjectPlaceholder")}
            value={subject}
            onChangeText={setSubject}
            maxLength={120}
          />

          <View>
            <Text style={[styles.label, { color: c.foreground }]}>
              {t("supportDetailLabel")}
            </Text>
            <View
              style={[
                styles.textareaWrap,
                {
                  backgroundColor: c.background,
                  borderColor: c.border,
                  borderRadius: c.radius - 4,
                },
              ]}
            >
              <Input
                placeholder={t("supportDetailPlaceholder")}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={6}
                style={{ height: 140, textAlignVertical: "top" }}
                maxLength={2000}
              />
            </View>
          </View>

          {error ? (
            <Text style={[styles.errorText, { color: c.destructive }]}>
              {error}
            </Text>
          ) : null}

          <Button
            label={t("supportSubmit")}
            onPress={onSubmit}
            loading={submitting}
            size="lg"
          />
        </KeyboardAwareScrollView>
      ) : loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon="inbox"
          title={t("supportNoTickets")}
          description={t("supportNoTicketsDesc")}
          cta={{ label: t("supportCreateTicket"), onPress: () => setTab("new") }}
        />
      ) : (
        <KeyboardAwareScrollView
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
          {tickets.map((tk) => (
            <TicketCard key={tk.id} ticket={tk} />
          ))}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const c = useColors();
  const { t } = useT();
  const colors = STATUS_COLORS[ticket.status];
  const STATUS_LABEL: Record<TicketStatus, string> = {
    open: t("ticketStatusOpen"),
    in_progress: t("ticketStatusInProgress"),
    closed: t("ticketStatusClosed"),
  };
  const date = new Date(ticket.createdAt);
  const dateLabel = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

  return (
    <Card>
      <View style={styles.ticketHead}>
        <Text
          style={[styles.ticketSubject, { color: c.foreground }]}
          numberOfLines={1}
        >
          {ticket.subject}
        </Text>
        <View
          style={[styles.statusPill, { backgroundColor: colors.bg }]}
        >
          <Text style={[styles.statusText, { color: colors.fg }]}>
            {STATUS_LABEL[ticket.status]}
          </Text>
        </View>
      </View>
      <Text
        style={[styles.ticketBody, { color: c.mutedForeground }]}
        numberOfLines={3}
      >
        {ticket.message}
      </Text>
      {ticket.adminReply ? (
        <View
          style={[
            styles.replyBox,
            { backgroundColor: c.primaryBg, borderColor: c.primary + "40" },
          ]}
        >
          <Text style={[styles.replyLabel, { color: c.primary }]}>
            {t("supportTeamReply")}
          </Text>
          <Text style={[styles.replyText, { color: c.foreground }]}>
            {ticket.adminReply}
          </Text>
        </View>
      ) : null}
      <Text style={[styles.ticketDate, { color: c.mutedForeground }]}>
        {dateLabel}
      </Text>
    </Card>
  );
}

function TabBtn({
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
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabsBar: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 2,
  },
  tabText: { fontSize: 13 },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
  headerDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    marginTop: 4,
    lineHeight: 18,
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    marginBottom: 6,
    textAlign: "right",
  },
  textareaWrap: {
    borderWidth: 1,
    padding: 0,
  },
  errorText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    textAlign: "right",
  },
  loadingWrap: {
    paddingTop: 60,
    alignItems: "center",
  },
  ticketHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  ticketSubject: {
    flex: 1,
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  statusText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  ticketBody: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    marginTop: 8,
    lineHeight: 19,
  },
  replyBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  replyLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    textAlign: "right",
    marginBottom: 6,
  },
  replyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 19,
  },
  ticketDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    textAlign: "left",
    marginTop: 8,
  },
});
