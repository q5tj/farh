import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { fetchAppContent, type AppContentEntry } from "@/lib/data";
import { useT } from "@/lib/i18n";

export default function AboutScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { t } = useT();
  const lang = profile?.language ?? "ar";

  const SECTIONS: {
    key: string;
    title: string;
    icon: keyof typeof Feather.glyphMap;
  }[] = [
    { key: "about_idea", title: t("aboutIdea"), icon: "zap" },
    { key: "about_goal", title: t("aboutGoal"), icon: "target" },
    { key: "about_how", title: t("aboutHow"), icon: "compass" },
  ];

  const [content, setContent] = useState<AppContentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchAppContent()
      .then((entries) => {
        if (alive) setContent(entries);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const getValue = (key: string): string => {
    const entry = content.find((e) => e.key === key);
    if (!entry) return "";
    return lang === "en"
      ? entry.valueEn || entry.valueAr
      : entry.valueAr || entry.valueEn;
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("aboutApp")} />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 30,
        }}
      >
        <LinearGradient
          colors={["#7b2cbf", "#5a189a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.logoCircle}>
            <Image
              source={require("../assets/images/icon.png")}
              style={styles.logo}
            />
          </View>
          <Text style={styles.appName}>{t("appName")}</Text>
          <Text style={styles.version}>
            {t("version")} 1.0.0
          </Text>
        </LinearGradient>

        <View style={{ padding: 16, gap: 12 }}>
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={c.primary} />
            </View>
          ) : (
            SECTIONS.map((s) => {
              const value = getValue(s.key);
              if (!value) return null;
              return (
                <Card key={s.key}>
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.iconBox,
                        { backgroundColor: c.primaryBg },
                      ]}
                    >
                      <Feather name={s.icon} size={20} color={c.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.sectionTitle, { color: c.foreground }]}
                      >
                        {s.title}
                      </Text>
                      <Text
                        style={[
                          styles.sectionBody,
                          { color: c.mutedForeground },
                        ]}
                      >
                        {value}
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })
          )}

          <Text style={[styles.footerText, { color: c.mutedForeground }]}>
            © 2026 {t("appName")}. {t("allRightsReserved")}
          </Text>
          <Text style={[styles.footerText, { color: c.mutedForeground }]}>
            farhatukum.com
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 40,
    alignItems: "center",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logo: { width: 64, height: 64, borderRadius: 32 },
  appName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 28,
    color: "#ffffff",
    letterSpacing: 1,
  },
  version: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: 4,
  },
  row: {
    flexDirection: "row-reverse",
    gap: 12,
    alignItems: "flex-start",
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    textAlign: "right",
  },
  sectionBody: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    marginTop: 8,
    textAlign: "right",
    lineHeight: 22,
  },
  footerText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    textAlign: "center",
    marginTop: 16,
  },
});
