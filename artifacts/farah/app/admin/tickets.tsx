import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { useColors } from "@/hooks/useColors";
import {
  adminFetchAllTickets,
  adminReplyToTicket,
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

type Translator = ReturnType<typeof useT>["t"];

function statusLabel(status: TicketStatus, t: Translator): string {
  if (status === "open") return t("ticketStatusOpen");
  if (status === "in_progress") return t("ticketStatusInProgress");
  return t("ticketStatusClosed");
}

export default function AdminTicketsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const FILTERS: { id: "all" | TicketStatus; label: string }[] = [
    { id: "all", label: t("all") },
    { id: "closed", label: t("ticketStatusClosed") },
    { id: "in_progress", label: t("ticketStatusInProgress") },
    { id: "open", label: t("ticketStatusOpen") },
  ];
  const [filter, setFilter] = useState<"all" | TicketStatus>("open");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<SupportTicket | null>(null);

  const load = async () => {
    try {
      const list = await adminFetchAllTickets();
      setTickets(list);
    } catch (e) {
      console.warn("[admin tickets] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return tickets;
    return tickets.filter((t) => t.status === filter);
  }, [tickets, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("supportTicketsTitle")}
        subtitle={t("ticketsCountSubtitle", { count: tickets.length })}
      />
      <View style={[styles.filterBar, { borderBottomColor: c.border }]}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[
                styles.filterChip,
                { backgroundColor: active ? c.primary : c.muted },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: active ? "#ffffff" : c.foreground },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState icon="inbox" title={t("noTicketsInCategory")} />
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
          {filtered.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              onReply={() => setEditing(t)}
            />
          ))}
        </KeyboardAwareScrollView>
      )}

      <ReplyModal
        ticket={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    </View>
  );
}

function TicketCard({
  ticket,
  onReply,
}: {
  ticket: SupportTicket;
  onReply: () => void;
}) {
  const c = useColors();
  const { t } = useT();
  const colors = STATUS_COLORS[ticket.status];
  const date = new Date(ticket.createdAt);
  const dateLabel = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;

  const roleLabel =
    ticket.userRole === "provider"
      ? t("roleProvider")
      : ticket.userRole === "admin"
        ? t("roleAdmin")
        : t("roleCustomer");

  return (
    <Card>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.subject, { color: c.foreground }]}
            numberOfLines={1}
          >
            {ticket.subject}
          </Text>
          <Text style={[styles.meta, { color: c.mutedForeground }]}>
            {ticket.userName ?? ticket.userEmail ?? "—"} • {roleLabel} •{" "}
            {dateLabel}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: colors.bg }]}>
          <Text style={[styles.statusText, { color: colors.fg }]}>
            {statusLabel(ticket.status, t)}
          </Text>
        </View>
      </View>

      <Text style={[styles.body, { color: c.foreground }]}>
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
            {t("ticketYourPreviousReply")}
          </Text>
          <Text style={[styles.replyText, { color: c.foreground }]}>
            {ticket.adminReply}
          </Text>
        </View>
      ) : null}

      {(ticket.userPhone || ticket.userEmail) && (
        <View style={styles.contactRow}>
          {ticket.userPhone ? (
            <View style={styles.contactItem}>
              <Feather name="phone" size={11} color={c.mutedForeground} />
              <Text style={[styles.contactText, { color: c.mutedForeground }]}>
                {ticket.userPhone}
              </Text>
            </View>
          ) : null}
          {ticket.userEmail ? (
            <View style={styles.contactItem}>
              <Feather name="mail" size={11} color={c.mutedForeground} />
              <Text
                style={[styles.contactText, { color: c.mutedForeground }]}
                numberOfLines={1}
              >
                {ticket.userEmail}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.actionRow}>
        <Button
          label={ticket.adminReply ? t("ticketEditReply") : t("ticketReplyToTicket")}
          onPress={onReply}
        />
      </View>
    </Card>
  );
}

function ReplyModal({
  ticket,
  onClose,
  onSaved,
}: {
  ticket: SupportTicket | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useColors();
  const { t } = useT();
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<TicketStatus>("in_progress");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ticket) {
      setReply(ticket.adminReply ?? "");
      setStatus(ticket.status === "open" ? "in_progress" : ticket.status);
    }
  }, [ticket]);

  const onSubmit = async () => {
    if (!ticket) return;
    if (!reply.trim()) {
      const msg = t("ticketEnterReply");
      await infoDialog({ title: t("error"), message: msg });
      return;
    }
    setSaving(true);
    try {
      await adminReplyToTicket({
        id: ticket.id,
        reply: reply.trim(),
        status,
      });
      onSaved();
    } catch (e) {
      const msg = (e as Error).message ?? t("ticketSaveFail");
      await infoDialog({ title: t("error"), message: msg });
    } finally {
      setSaving(false);
    }
  };

  if (!ticket) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => !saving && onClose()}
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
              {t("ticketReplyTitle")}
            </Text>
            <Text
              style={[styles.modalSubject, { color: c.mutedForeground }]}
              numberOfLines={1}
            >
              {ticket.subject}
            </Text>

            <View
              style={[
                styles.originalBox,
                { backgroundColor: c.muted, borderColor: c.border },
              ]}
            >
              <Text style={[styles.originalText, { color: c.foreground }]}>
                {ticket.message}
              </Text>
            </View>

            <Text style={[styles.label, { color: c.foreground }]}>{t("ticketReplyLabel")}</Text>
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
                placeholder={t("ticketReplyPlaceholder")}
                value={reply}
                onChangeText={setReply}
                multiline
                numberOfLines={5}
                style={{ height: 120, textAlignVertical: "top" }}
                maxLength={2000}
              />
            </View>

            <Text style={[styles.label, { color: c.foreground }]}>
              {t("ticketStatusLabel")}
            </Text>
            <View style={styles.statusRow}>
              {(["in_progress", "closed"] as TicketStatus[]).map((s) => {
                const active = status === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(s)}
                    style={[
                      styles.statusOption,
                      {
                        backgroundColor: active ? c.primary : c.muted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusOptionText,
                        { color: active ? "#ffffff" : c.foreground },
                      ]}
                    >
                      {statusLabel(s, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}
            >
              <View style={{ flex: 1 }}>
                <Button label={t("ticketSaveReply")} onPress={onSubmit} loading={saving} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("cancel")}
                  variant="ghost"
                  onPress={() => !saving && onClose()}
                />
              </View>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    flexWrap: "wrap",
    flexDirection: "row",
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
  },
  filterText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  loadingWrap: { paddingTop: 60, alignItems: "center" },
  head: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  subject: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  meta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  statusText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    marginTop: 12,
    lineHeight: 20,
  },
  replyBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  replyLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    textAlign: "right",
    marginBottom: 4,
  },
  replyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 18,
  },
  contactRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 10,
  },
  contactItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  contactText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
  },
  actionRow: { marginTop: 12 },
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
    maxWidth: 480,
    alignSelf: "center",
    padding: 20,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
  },
  modalSubject: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    marginTop: 4,
  },
  originalBox: {
    marginTop: 14,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  originalText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 19,
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    marginTop: 14,
    marginBottom: 6,
    textAlign: "right",
  },
  textareaWrap: {
    borderWidth: 1,
    padding: 0,
  },
  statusRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  statusOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  statusOptionText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
});
