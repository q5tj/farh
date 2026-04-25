import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { STRINGS } from "@/constants/strings";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

interface RowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  badge?: string;
}

function Row({ icon, label, onPress, destructive, badge }: RowProps) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.rowIcon,
          {
            backgroundColor: destructive ? "#fee2e2" : c.primaryBg,
          },
        ]}
      >
        <Feather
          name={icon}
          size={18}
          color={destructive ? c.destructive : c.primary}
        />
      </View>
      <Text
        style={[
          styles.rowLabel,
          {
            color: destructive ? c.destructive : c.foreground,
          },
        ]}
      >
        {label}
      </Text>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: c.primary }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Feather name="chevron-left" size={18} color={c.mutedForeground} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, signOut, setRole } = useAuth();

  const confirmLogout = () => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("هل تريد تسجيل الخروج؟")) {
        signOut();
      }
      return;
    }
    Alert.alert("تسجيل الخروج", "هل تريد فعلاً تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "تأكيد", style: "destructive", onPress: signOut },
    ]);
  };

  const roleLabel =
    user?.role === "admin"
      ? STRINGS.adminAccount
      : user?.role === "provider"
        ? STRINGS.providerAccount
        : STRINGS.customerAccount;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: isWeb ? 110 : insets.bottom + 90,
        }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.hero,
            {
              paddingTop:
                (isWeb ? Math.max(insets.top, 30) : insets.top) + 20,
            },
          ]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0) ?? "ض"}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.name}</Text>
          <View style={styles.userMeta}>
            <Feather name="phone" size={12} color="rgba(255,255,255,0.85)" />
            <Text style={styles.userPhone}>{user?.phone}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{roleLabel}</Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {(user?.role === "provider" || user?.role === "admin") && (
            <Card style={{ marginBottom: 14 }} padded={false}>
              <Row
                icon={user.role === "admin" ? "shield" : "briefcase"}
                label={
                  user.role === "admin"
                    ? STRINGS.switchToAdmin
                    : STRINGS.switchToProvider
                }
                onPress={() => {
                  if (user.role === "admin") router.push("/admin");
                  else router.push("/provider-zone");
                }}
              />
            </Card>
          )}

          <Card padded={false}>
            <Row icon="user" label={STRINGS.myAccount} />
            <View style={[styles.sep, { backgroundColor: c.border }]} />
            <Row icon="globe" label={STRINGS.language} badge={STRINGS.arabic} />
            <View style={[styles.sep, { backgroundColor: c.border }]} />
            <Row icon="help-circle" label={STRINGS.support} />
            <View style={[styles.sep, { backgroundColor: c.border }]} />
            <Row icon="info" label={STRINGS.aboutApp} />
          </Card>

          <Card style={{ marginTop: 14 }} padded={false}>
            <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>
              {STRINGS.enableTesterMode}
            </Text>
            <Text
              style={[
                styles.sectionDesc,
                { color: c.mutedForeground, marginBottom: 8 },
              ]}
            >
              {STRINGS.enableTesterModeDesc}
            </Text>
            <View style={styles.rolesRow}>
              <RoleBtn
                label="عميل"
                active={user?.role === "customer"}
                onPress={() => setRole("customer")}
              />
              <RoleBtn
                label="مزود خدمة"
                active={user?.role === "provider"}
                onPress={() => setRole("provider")}
              />
              <RoleBtn
                label="مالك"
                active={user?.role === "admin"}
                onPress={() => setRole("admin")}
              />
            </View>
          </Card>

          <Card style={{ marginTop: 14 }} padded={false}>
            <Row
              icon="log-out"
              label={STRINGS.logout}
              destructive
              onPress={confirmLogout}
            />
          </Card>

          <Text style={[styles.version, { color: c.mutedForeground }]}>
            فرح • الإصدار 1.0.0
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function RoleBtn({
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
        styles.roleBtn,
        {
          backgroundColor: active ? c.primary : c.muted,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.roleBtnText,
          { color: active ? "#ffffff" : c.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    alignItems: "center",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  avatarText: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    color: "#ffffff",
  },
  userName: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#ffffff",
  },
  userMeta: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  userPhone: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
  },
  rolePill: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 100,
  },
  rolePillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#ffffff",
  },
  body: {
    padding: 16,
    marginTop: -12,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15, textAlign: "right" },
  sep: { height: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#ffffff",
  },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    paddingHorizontal: 16,
    paddingTop: 14,
    textAlign: "right",
  },
  sectionDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    paddingHorizontal: 16,
    textAlign: "right",
  },
  rolesRow: {
    flexDirection: "row-reverse",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  roleBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  version: {
    textAlign: "center",
    marginTop: 24,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
});
