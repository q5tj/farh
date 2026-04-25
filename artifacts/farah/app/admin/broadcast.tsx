import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

export default function BroadcastScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <ScreenHeader title="إشعار جماعي" />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 30,
        }}
      >
        <Card>
          <Text style={[styles.title, { color: c.foreground }]}>
            أرسل إشعاراً لجميع المستخدمين
          </Text>
          <Text style={[styles.desc, { color: c.mutedForeground }]}>
            استخدمها للترويج لعروض موسمية أو إعلانات هامة.
          </Text>
          <View style={{ marginTop: 16, gap: 12 }}>
            <Input
              label="عنوان الإشعار"
              value={title}
              onChangeText={setTitle}
              placeholder="مثال: عروض الصيف"
            />
            <View>
              <Text
                style={[
                  styles.label,
                  { color: c.foreground },
                ]}
              >
                محتوى الإشعار
              </Text>
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="اكتب نص الإشعار..."
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
              label={sent ? "تم الإرسال ✓" : "إرسال للجميع"}
              onPress={send}
              variant={sent ? "secondary" : "primary"}
            />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: "Inter_700Bold", fontSize: 16, textAlign: "right" },
  desc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 6,
    lineHeight: 21,
    textAlign: "right",
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    marginBottom: 8,
    textAlign: "right",
  },
  textarea: {
    borderWidth: 1,
    minHeight: 110,
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "right",
    textAlignVertical: "top",
    writingDirection: "rtl",
  },
});
