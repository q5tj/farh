import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
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
import {
  adminFetchAllUsers,
  adminSetUserRole,
  type AdminUserRow,
} from "@/lib/data";
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
      const msg = t("cantChangeAdmin");
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(msg);
      } else {
        Alert.alert(t("notAllowed"), msg);
      }
      return;
    }
    const next = user.role === "customer" ? "provider" : "customer";
    const userName = user.fullName ?? t("guest");
    const confirmText =
      next === "provider"
        ? t("promoteConfirm", { name: userName })
        : t("demoteConfirm", { name: userName });

    const run = async () => {
      setBusyUser(user.id);
      try {
        await adminSetUserRole(user.id, next);
        await load();
      } catch (e) {
        const msg = (e as Error).message ?? t("updateRoleFailed");
        if (Platform.OS === "web") {
          if (typeof window !== "undefined") window.alert(msg);
        } else {
          Alert.alert(t("error"), msg);
        }
      } finally {
        setBusyUser(null);
      }
    };

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(confirmText)) run();
    } else {
      Alert.alert(t("confirm"), confirmText, [
        { text: t("cancel"), style: "cancel" },
        { text: t("confirm"), onPress: run },
      ]);
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
      <ScreenHeader title={t("manageUsers")} subtitle={t("usersCount", { count: users.length })} />

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
    </View>
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
          <View style={styles.metaRow}>
            {user.phone ? (
              <Text style={[styles.meta, { color: c.mutedForeground }]}>
                {user.phone}
              </Text>
            ) : null}
            {user.city ? (
              <>
                <View
                  style={[styles.dot, { backgroundColor: c.mutedForeground }]}
                />
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
});
