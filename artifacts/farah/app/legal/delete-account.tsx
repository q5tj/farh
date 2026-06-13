import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useColors } from "@/hooks/useColors";

/**
 * Public-facing account-deletion instructions page. Reachable at
 * https://farhatukum.com/legal/delete-account on the web build, which is
 * the URL we submit to Google Play under "Account deletion URL" (Play
 * Console policy section 4.8).
 *
 * Google expects the URL to:
 *   • be publicly accessible (no login required)
 *   • prominently explain how to delete the account
 *   • list what data is removed vs. retained
 *   • reference the app / developer name
 *
 * The in-app delete button (profile tab → "حذف حسابي") is the
 * actual deletion mechanism — this page just documents how to use it,
 * with a fallback email path for users who can't get into the app.
 */
export default function DeleteAccountInstructions() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="حذف الحساب — Account Deletion" />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 32,
          maxWidth: 720,
          alignSelf: "center",
          width: "100%",
        }}
      >
        {/* Arabic ----------------------------------------------------- */}
        <Card>
          <Text style={[styles.h1, { color: c.foreground }]}>
            حذف حسابك في فرحتكم
          </Text>
          <Text style={[styles.p, { color: c.mutedForeground }]}>
            تطبيق <Text style={{ fontFamily: "Cairo_700Bold" }}>فرحتكم</Text>{" "}
            (المطوّر: علي حفظي) يدعم حذف الحساب نهائياً من داخل التطبيق
            مباشرة. هذه الصفحة توضّح الخطوات.
          </Text>

          <Text style={[styles.h2, { color: c.foreground }]}>الخطوات</Text>
          <Step n="1" text="افتح تطبيق فرحتكم على جوالك." />
          <Step n="2" text='اضغط تبويب "حسابي" في الشريط السفلي.' />
          <Step
            n="3"
            text={'انزل لأسفل الشاشة، اضغط زر "حذف حسابي" (تحت زر "تسجيل الخروج").'}
          />
          <Step
            n="4"
            text='اكتب كلمة "حذف" في صندوق التأكيد لتفعيل زر الحذف.'
          />
          <Step
            n="5"
            text="اضغط الزر — يُحذف حسابك خلال ثوانٍ ويتم تسجيل خروجك."
          />

          <Text style={[styles.h2, { color: c.foreground }]}>ما الذي يُحذف</Text>
          <Bullet text="اسمك، بريدك الإلكتروني، رقم جوالك، عنوانك، وأي صور رفعتها." />
          <Bullet text="جلسات الدخول وصلاحياتك." />
          <Bullet text="إن كنت مزود خدمة: متجرك يُعطّل ويختفي عن العملاء." />

          <Text style={[styles.h2, { color: c.foreground }]}>
            ما الذي يُحتفظ به (وللسبب)
          </Text>
          <Bullet text="سجلات الحجوزات المكتملة والمدفوعات: نحتفظ بها مع طمس بياناتك الشخصية، وذلك للالتزام بمتطلبات المحاسبة والشريعة والأنظمة المحلية لمدة أقصاها 10 سنوات." />
          <Bullet text="معرّفات تقنية مجهولة الهوية لأغراض الأمان وكشف الاحتيال." />

          <Text style={[styles.h2, { color: c.foreground }]}>متطلبات قبل الحذف</Text>
          <Bullet text="لا يمكن حذف الحساب إذا كان لديك حجز قيد التنفيذ — أكمله أو ألغه أولاً." />
          <Bullet text="إن كنت مزود خدمة، لا يمكن الحذف قبل سداد أي عمولات منصة مستحقة." />

          <Text style={[styles.h2, { color: c.foreground }]}>
            لا تستطيع الدخول للتطبيق؟
          </Text>
          <Text style={[styles.p, { color: c.mutedForeground }]}>
            راسلنا على{" "}
            <Pressable
              onPress={() =>
                Linking.openURL("mailto:Farahappsa@gmail.com?subject=طلب حذف حساب")
              }
            >
              <Text style={[styles.link, { color: c.primary }]}>
                Farahappsa@gmail.com
              </Text>
            </Pressable>{" "}
            من نفس بريد حسابك، مع كتابة "طلب حذف حساب" في عنوان الرسالة.
            سنحذف حسابك خلال 30 يوماً.
          </Text>
        </Card>

        {/* English ---------------------------------------------------- */}
        <Card style={{ marginTop: 16 }}>
          <Text style={[styles.h1, { color: c.foreground, textAlign: "left" }]}>
            Delete your Farhatukum account
          </Text>
          <Text style={[styles.p, { color: c.mutedForeground, textAlign: "left" }]}>
            The Farhatukum app (developer: Ali Hifthi) lets you permanently
            delete your account from within the app. Here's how.
          </Text>

          <Text style={[styles.h2, { color: c.foreground, textAlign: "left" }]}>
            Steps
          </Text>
          <Step n="1" text="Open the Farhatukum app on your phone." en />
          <Step n="2" text='Tap the "Profile" tab in the bottom bar.' en />
          <Step
            n="3"
            text='Scroll to the bottom and tap "Delete my account" (under "Sign out").'
            en
          />
          <Step
            n="4"
            text='Type the word "DELETE" in the confirmation box.'
            en
          />
          <Step
            n="5"
            text="Tap the delete button — your account is removed in seconds and you'll be signed out."
            en
          />

          <Text style={[styles.h2, { color: c.foreground, textAlign: "left" }]}>
            What we delete
          </Text>
          <Bullet text="Your name, email, phone number, address, and any photos you uploaded." en />
          <Bullet text="Your login sessions and permissions." en />
          <Bullet text="If you're a provider: your store is disabled and hidden from customers." en />

          <Text style={[styles.h2, { color: c.foreground, textAlign: "left" }]}>
            What we keep (and why)
          </Text>
          <Bullet
            text="Completed booking and payment records, with your personal details anonymised, are retained for up to 10 years to comply with Saudi accounting, tax, and AML regulations."
            en
          />
          <Bullet
            text="Anonymous technical identifiers for security and fraud-prevention purposes."
            en
          />

          <Text style={[styles.h2, { color: c.foreground, textAlign: "left" }]}>
            Before you can delete
          </Text>
          <Bullet
            text="You cannot delete the account while you have a pending or accepted booking — complete or cancel it first."
            en
          />
          <Bullet
            text="Providers cannot delete the account while there is unsettled platform commission."
            en
          />

          <Text style={[styles.h2, { color: c.foreground, textAlign: "left" }]}>
            Can't access the app?
          </Text>
          <Text style={[styles.p, { color: c.mutedForeground, textAlign: "left" }]}>
            Email us at{" "}
            <Pressable
              onPress={() =>
                Linking.openURL(
                  "mailto:Farahappsa@gmail.com?subject=Account Deletion Request",
                )
              }
            >
              <Text style={[styles.link, { color: c.primary }]}>
                Farahappsa@gmail.com
              </Text>
            </Pressable>{" "}
            from the email address on your account, with the subject
            "Account Deletion Request". Your account will be deleted
            within 30 days.
          </Text>
        </Card>

        <Text
          style={{
            marginTop: 24,
            fontSize: 11,
            color: c.mutedForeground,
            textAlign: "center",
            fontFamily: "Cairo_400Regular",
          }}
        >
          Farhatukum · فرحتكم · com.farhatukum.app
        </Text>
      </ScrollView>
    </View>
  );
}

function Step({ n, text, en }: { n: string; text: string; en?: boolean }) {
  const c = useColors();
  return (
    <View
      style={[
        styles.step,
        en ? { flexDirection: "row" } : { flexDirection: "row-reverse" },
      ]}
    >
      <View style={[styles.stepNum, { backgroundColor: c.primaryBg }]}>
        <Text style={[styles.stepNumText, { color: c.primary }]}>{n}</Text>
      </View>
      <Text
        style={[
          styles.stepText,
          { color: c.foreground, textAlign: en ? "left" : "right" },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function Bullet({ text, en }: { text: string; en?: boolean }) {
  const c = useColors();
  return (
    <View
      style={[
        styles.bullet,
        en ? { flexDirection: "row" } : { flexDirection: "row-reverse" },
      ]}
    >
      <Text style={[styles.bulletDot, { color: c.primary }]}>•</Text>
      <Text
        style={[
          styles.bulletText,
          { color: c.mutedForeground, textAlign: en ? "left" : "right" },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    textAlign: "right",
    marginBottom: 8,
  },
  h2: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    textAlign: "right",
    marginTop: 16,
    marginBottom: 6,
  },
  p: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
  },
  link: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  step: { gap: 10, marginBottom: 8, alignItems: "flex-start" },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  stepText: {
    flex: 1,
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    lineHeight: 21,
  },
  bullet: { gap: 8, marginBottom: 6, alignItems: "flex-start" },
  bulletDot: { fontFamily: "Cairo_700Bold", fontSize: 14, marginTop: 2 },
  bulletText: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    lineHeight: 20,
  },
});
