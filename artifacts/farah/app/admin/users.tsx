import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { downloadCsv } from "@/lib/csv-export";
import {
  adminDemoteProvider,
  adminFetchAllUsers,
  adminSetUserRole,
  type AdminUserRow,
} from "@/lib/data";
import { confirmDialog, infoDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";

type RoleTab = "all" | "customer" | "provider" | "admin";

const ROLE_COLORS: Record<NonNullable<AdminUserRow["role"]>, { bg: string; fg: string }> = {
  customer: { bg: "#dbeafe", fg: "#1d4ed8" },
  provider: { bg: "#dcfce7", fg: "#166534" },
  admin: { bg: "#f5d0fe", fg: "#86198f" },
};

export default function UsersScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const ROLE_LABEL: Record<NonNullable<AdminUserRow["role"]>, string> = {
    customer: t("roleCustomer"),
    provider: t("roleProvider"),
    admin: t("roleAdmin"),
  };
  const [tab, setTab] = useState<RoleTab>("all");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const exportTo = (scope: "all" | "customer" | "provider") => {
    setExportOpen(false);
    const subset =
      scope === "all" ? users : users.filter((u) => u.role === scope);
    const filename =
      scope === "all"
        ? "users-all.csv"
        : scope === "customer"
          ? "users-customers.csv"
          : "users-providers.csv";
    downloadCsv(filename, subset, [
      { key: "id", header: t("exportColumnId") },
      { key: "fullName", header: t("exportColumnFullName") },
      { key: "email", header: t("exportColumnEmail") },
      { key: "phone", header: t("exportColumnPhone") },
      {
        key: "role",
        header: t("exportColumnRole"),
        format: (v) => ROLE_LABEL[v as keyof typeof ROLE_LABEL] ?? String(v),
      },
      { key: "city", header: t("exportColumnCity") },
      {
        key: "createdAt",
        header: t("exportColumnCreatedAt"),
        format: (v) =>
          v ? new Date(String(v)).toISOString().slice(0, 10) : "",
      },
    ]);
  };

  const load = async () => {
    try {
      const list = await adminFetchAllUsers();
      setUsers(list);
    } catch (e) {
      console.warn("[admin users] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = users;
    if (tab !== "all") list = list.filter((u) => u.role === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (u) =>
          (u.fullName ?? "").toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.phone ?? "").includes(q),
      );
    }
    return list;
  }, [users, tab, search]);

  const toggleRole = async (user: AdminUserRow) => {
    if (user.role === "admin") {
      await infoDialog({
        title: t("notAllowed"),
        message: t("cantChangeAdmin"),
      });
      return;
    }
    const next = user.role === "customer" ? "provider" : "customer";
    const userName = user.fullName ?? t("guest");
    const ok = await confirmDialog({
      title: t("confirm"),
      message:
        next === "provider"
          ? t("promoteConfirm", { name: userName })
          : t("demoteConfirm", { name: userName }),
      destructive: next === "customer",
    });
    if (!ok) return;
    setBusyUser(user.id);
    try {
      if (next === "customer") {
        // Provider → customer: full cleanup via RPC (deletes services,
        // gallery, reviews, service areas, storage objects, etc.).
        await adminDemoteProvider(user.id);
      } else {
        await adminSetUserRole(user.id, next);
      }
      await load();
    } catch (e) {
      const msg = (e as Error).message ?? t("updateRoleFailed");
      await infoDialog({ title: t("error"), message: msg });
    } finally {
      setBusyUser(null);
    }
  };

  const counts = useMemo(
    () => ({
      all: users.length,
      customer: users.filter((u) => u.role === "customer").length,
      provider: users.filter((u) => u.role === "provider").length,
      admin: users.filter((u) => u.role === "admin").length,
    }),
    [users],
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={t("manageUsers")}
        subtitle={t("usersCount", { count: users.length })}
        right={
          <Pressable
            onPress={() => setExportOpen(true)}
            style={[styles.exportBtn, { backgroundColor: c.primary }]}
          >
            <Feather name="download" size={14} color="#ffffff" />
            <Text style={styles.exportBtnText}>{t("exportCsv")}</Text>
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Input
          placeholder={t("searchUsersPlaceholder")}
          value={search}
          onChangeText={setSearch}
          rightIcon={<Feather name="search" size={16} color={c.mutedForeground} />}
        />
      </View>

      <View style={[styles.tabsBar, { borderBottomColor: c.border }]}>
        <TabBtn label={t("usersAllTab", { count: counts.all })} active={tab === "all"} onPress={() => setTab("all")} />
        <TabBtn
          label={t("usersCustomersTab", { count: counts.customer })}
          active={tab === "customer"}
          onPress={() => setTab("customer")}
        />
        <TabBtn
          label={t("usersProvidersTab", { count: counts.provider })}
          active={tab === "provider"}
          onPress={() => setTab("provider")}
        />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState icon="users" title={t("noMatchingUsers")} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
            gap: 10,
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
          {filtered.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              busy={busyUser === u.id}
              onToggleRole={() => toggleRole(u)}
            />
          ))}
        </ScrollView>
      )}

      <Modal
        visible={exportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExportOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setExportOpen(false)}
        >
          <Pressable
            style={[styles.modalSheet, { backgroundColor: c.background }]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <Text style={[styles.modalTitle, { color: c.foreground }]}>
              {t("exportPickScope")}
            </Text>
            <ScopeRow
              icon="users"
              label={t("exportAll")}
              count={counts.all}
              onPress={() => exportTo("all")}
            />
            <ScopeRow
              icon="user"
              label={t("exportCustomers")}
              count={counts.customer}
              onPress={() => exportTo("customer")}
            />
            <ScopeRow
              icon="briefcase"
              label={t("exportProviders")}
              count={counts.provider}
              onPress={() => exportTo("provider")}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ScopeRow({
  icon,
  label,
  count,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  count: number;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.scopeRow,
        {
          backgroundColor: pressed ? c.muted : "transparent",
          borderColor: c.border,
        },
      ]}
    >
      <View style={[styles.scopeIcon, { backgroundColor: c.primaryBg }]}>
        <Feather name={icon} size={18} color={c.primary} />
      </View>
      <Text style={[styles.scopeLabel, { color: c.foreground }]}>{label}</Text>
      <View style={[styles.scopeBadge, { backgroundColor: c.muted }]}>
        <Text style={[styles.scopeBadgeText, { color: c.mutedForeground }]}>
          {count}
        </Text>
      </View>
      <Feather name="chevron-left" size={18} color={c.mutedForeground} />
    </Pressable>
  );
}

function UserCard({
  user,
  busy,
  onToggleRole,
}: {
  user: AdminUserRow;
  busy: boolean;
  onToggleRole: () => void;
}) {
  const c = useColors();
  const { t } = useT();
  const ROLE_LABEL: Record<NonNullable<AdminUserRow["role"]>, string> = {
    customer: t("roleCustomer"),
    provider: t("roleProvider"),
    admin: t("roleAdmin"),
  };
  const roleColors = ROLE_COLORS[user.role];

  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: c.primaryBg }]}>
          {user.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              style={{ width: "100%", height: "100%", borderRadius: 22 }}
            />
          ) : (
            <Feather name="user" size={20} color={c.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: c.foreground }]}>
            {user.fullName?.trim() || user.email || t("noName")}
          </Text>
          {user.email ? (
            <Text
              style={[styles.email, { color: c.mutedForeground }]}
              numberOfLines={1}
            >
              {user.email}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {user.phone ? (
              <Text style={[styles.meta, { color: c.mutedForeground }]}>
                {user.phone}
              </Text>
            ) : null}
            {user.city ? (
              <>
                {user.phone ? (
                  <View
                    style={[styles.dot, { backgroundColor: c.mutedForeground }]}
                  />
                ) : null}
                <Text style={[styles.meta, { color: c.mutedForeground }]}>
                  {user.city}
                </Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={[styles.rolePill, { backgroundColor: roleColors.bg }]}>
          <Text style={[styles.roleText, { color: roleColors.fg }]}>
            {ROLE_LABEL[user.role]}
          </Text>
        </View>
      </View>

      {user.role !== "admin" ? (
        <Pressable
          onPress={onToggleRole}
          disabled={busy}
          style={[
            styles.roleBtn,
            {
              backgroundColor: c.muted,
              opacity: busy ? 0.6 : 1,
            },
          ]}
        >
          <Feather
            name={user.role === "customer" ? "arrow-up" : "arrow-down"}
            size={14}
            color={c.foreground}
          />
          <Text style={[styles.roleBtnText, { color: c.foreground }]}>
            {user.role === "customer"
              ? t("promoteToProvider")
              : t("demoteToCustomer")}
          </Text>
        </Pressable>
      ) : null}
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
    marginTop: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
  },
  tabText: { fontSize: 12 },
  loadingWrap: { paddingTop: 60, alignItems: "center" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  name: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  metaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    flexWrap: "wrap",
  },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 11 },
  dot: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 4 },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  roleText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  roleBtn: {
    marginTop: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  roleBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  email: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  exportBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
  },
  exportBtnText: {
    color: "#ffffff",
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 8,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
    marginBottom: 8,
  },
  scopeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scopeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  scopeLabel: {
    flex: 1,
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  scopeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 100,
    minWidth: 32,
    alignItems: "center",
  },
  scopeBadgeText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
});
