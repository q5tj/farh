import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/i18n";

export default function BroadcastScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { pushNotification } = useApp();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) return;
    await pushNotification({ title: title.trim(), body: body.trim() });
    setSent(true);
    setTitle("");
    setBody("");
    setTimeout(() => setSent(false), 2500);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={t("broadcastScreenTitle")} />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 30,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Card>
          <Text style={[styles.title, { color: c.foreground }]}>
            {t("broadcastHeading")}
          </Text>
          <Text style={[styles.desc, { color: c.mutedForeground }]}>
            {t("broadcastDescription")}
          </Text>
          <View style={{ marginTop: 16, gap: 12 }}>
            <Input
              label={t("broadcastTitle")}
              value={title}
              onChangeText={setTitle}
              placeholder={t("broadcastTitlePlaceholder")}
            />
            <View>
              <Text
                style={[
                  styles.label,
                  { color: c.foreground },
                ]}
              >
                {t("broadcastBodyLabel")}
              </Text>
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder={t("broadcastBodyPlaceholder")}
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={5}
                style={[
                  styles.textarea,
                  {
                    borderColor: c.border,
                    color: c.foreground,
                    borderRadius: c.radius - 4,
                    backgroundColor: c.background,
                  },
                ]}
              />
            </View>
            <Button
              label={sent ? t("broadcastSent") : t("broadcastSendToAll")}
              onPress={send}
              variant={sent ? "secondary" : "primary"}
            />
          </View>
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: "Cairo_700Bold", fontSize: 16, textAlign: "right" },
  desc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    marginTop: 6,
    lineHeight: 21,
    textAlign: "right",
  },
  label: {
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    marginBottom: 8,
    textAlign: "right",
  },
  textarea: {
    borderWidth: 1,
    minHeight: 110,
    padding: 14,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "right",
    textAlignVertical: "top",
    writingDirection: "rtl",
  },
});
