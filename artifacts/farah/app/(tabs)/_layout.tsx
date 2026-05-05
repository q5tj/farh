import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

// Subset of @react-navigation/bottom-tabs's BottomTabBarProps that we
// actually use. The library's full type isn't a direct dependency
// (expo-router pulls it in transitively), so we accept its shape via
// a permissive cast and only narrow the bits we read.
interface TabRoute {
  key: string;
  name: string;
  params?: object;
}
interface TabBarOptionsLike {
  title?: string;
  tabBarLabel?: unknown;
  tabBarIcon?: (p: {
    focused: boolean;
    color: string;
    size: number;
  }) => React.ReactNode;
  tabBarAccessibilityLabel?: string;
  tabBarButtonTestID?: string;
}
interface NavigationLike {
  emit: (event: {
    type: string;
    target: string;
    canPreventDefault?: boolean;
  }) => { defaultPrevented?: boolean };
  navigate: (name: string, params?: object) => void;
}

function NotificationDot({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={styles.dot}>
      <Text style={styles.dotText}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

/**
 * Custom bottom tab bar.
 *
 * Why this exists instead of relying on `flexDirection: row-reverse` in
 * tabBarStyle:
 *
 * 1. React Native auto-swaps `row` ↔ `row-reverse` when `I18nManager.isRTL`
 *    is true. After `forceRTL(true)` takes effect on iOS, our manual
 *    `row-reverse` got flipped *back* to `row`, leaving Home on the left.
 * 2. `I18nManager.isRTL` is unreliable across platforms and sessions —
 *    Android often stays LTR until the user reloads, web doesn't honor it
 *    at all, iOS only flips after a bridge restart.
 *
 * The robust fix: bypass flexbox direction games entirely and reverse the
 * `state.routes` array in JSX when the language is RTL. Layout direction
 * is then identical on every platform regardless of I18nManager state.
 */
function CustomTabBar(props: {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: TabBarOptionsLike }>;
  navigation: NavigationLike;
}) {
  const { state, descriptors, navigation } = props;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { isRtl } = useT();
  const isWeb = Platform.OS === "web";

  const bottomInset = isWeb ? 8 : insets.bottom;
  const labelPad = 4;
  const tabBarHeight = (isWeb ? 64 : 60) + bottomInset;

  // No JSX reversal needed: the root `RootShell` pins the entire app to
  // `direction: 'ltr'` (see comment there), so `flexDirection:
  // 'row-reverse'` below is treated literally on every platform — first
  // child on the right, last on the left. Arabic glyphs still flow RTL
  // via Unicode bidi.
  const visualRoutes = state.routes;

  return (
    <View
      style={[
        styles.bar,
        {
          height: tabBarHeight,
          backgroundColor: c.background,
          borderTopColor: c.border,
          paddingBottom: bottomInset + labelPad,
          // Arabic: row-reverse (Home on right). English: normal row.
          flexDirection: isRtl ? "row-reverse" : "row",
        },
      ]}
    >
      {visualRoutes.map((route) => {
        // Find the *original* index — focus state is keyed off the real
        // route order, not the visual one.
        const originalIndex = state.routes.findIndex((r) => r.key === route.key);
        const focused = state.index === originalIndex;
        const { options } = descriptors[route.key];
        const tint = focused ? c.primary : c.mutedForeground;
        const label =
          typeof options.tabBarLabel === "string"
            ? options.tabBarLabel
            : (options.title ?? route.name);

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };
        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tab}
          >
            {options.tabBarIcon
              ? options.tabBarIcon({ focused, color: tint, size: 22 })
              : null}
            <Text
              style={[styles.label, { color: tint }]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const c = useColors();
  const { notifications } = useApp();
  const { t } = useT();
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Tabs
      tabBar={(props) => (
        <CustomTabBar
          {...(props as unknown as Parameters<typeof CustomTabBar>[0])}
        />
      )}
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("home"),
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t("bookings"),
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t("notifications"),
          tabBarIcon: ({ color, size }) => (
            <View>
              <Feather name="bell" size={size} color={color} />
              <NotificationDot count={unread} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("profile"),
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    // flexDirection is set inline based on language (row-reverse for
    // Arabic, row for English). Root `direction: 'ltr'` ensures the
    // platform doesn't auto-flip these.
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  label: {
    fontFamily: "Cairo_500Medium",
    fontSize: 10,
    marginTop: 2,
    includeFontPadding: false,
    textAlign: "center",
  },
  dot: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  dotText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Cairo_700Bold",
  },
});
