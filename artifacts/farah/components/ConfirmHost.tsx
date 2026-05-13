import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";
import {
  notifyDialogClosed,
  setDialogListener,
  type DialogRequest,
} from "@/lib/dialog";

/**
 * Renders the styled confirm/info dialog. Mounted once near the root
 * so any code that calls `confirmDialog()` / `infoDialog()` from
 * lib/dialog can produce a Cairo-styled modal instead of an OS alert.
 */
export function ConfirmHost() {
  const [req, setReq] = useState<DialogRequest | null>(null);
  const c = useColors();
  const { t } = useT();

  useEffect(() => {
    setDialogListener(setReq);
    return () => setDialogListener(null);
  }, []);

  const handle = (value: boolean) => {
    if (!req) return;
    const current = req;
    setReq(null);
    // Defer the resolver + next-queue drain by one tick so the modal
    // exit animation can finish without competing with React state
    // updates from any code that runs in response to the resolver.
    setTimeout(() => {
      current.resolve(value);
      notifyDialogClosed();
    }, 0);
  };

  const isConfirm = req?.kind === "confirm";
  const confirmLabel =
    req?.confirmLabel ?? (isConfirm ? t("confirm") : t("ok"));
  const cancelLabel = req?.cancelLabel ?? t("cancel");

  const accentBg = req?.destructive ? "#fee2e2" : c.primaryBg;
  const accentFg = req?.destructive ? c.destructive : c.primary;

  return (
    <Modal
      visible={!!req}
      transparent
      animationType="fade"
      onRequestClose={() => handle(false)}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => handle(false)}
      >
        <Pressable
          style={[
            styles.card,
            {
              backgroundColor: c.background,
              borderRadius: c.radius,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.iconWrap, { backgroundColor: accentBg }]}>
            <Feather
              name={req?.destructive ? "alert-triangle" : "info"}
              size={28}
              color={accentFg}
            />
          </View>
          <Text
            style={[styles.title, { color: c.foreground }]}
            numberOfLines={3}
          >
            {req?.title ?? ""}
          </Text>
          {req?.message ? (
            <Text style={[styles.message, { color: c.mutedForeground }]}>
              {req.message}
            </Text>
          ) : null}
          <View
            style={[
              styles.actions,
              {
                flexDirection: isConfirm ? "row-reverse" : "row",
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Button
                label={confirmLabel}
                onPress={() => handle(true)}
                size="lg"
                variant={req?.destructive ? "destructive" : "primary"}
              />
            </View>
            {isConfirm ? (
              <View style={{ flex: 1 }}>
                <Button
                  label={cancelLabel}
                  variant="ghost"
                  onPress={() => handle(false)}
                  size="lg"
                />
              </View>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,11,46,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 26,
  },
  message: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  actions: {
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
});
