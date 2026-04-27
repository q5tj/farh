# فرح (Farah) — دليل المرحلة 6

> هذه المرحلة تضيف **Push Notifications عبر Expo** — لما تنشأ سطر جديد في جدول `notifications` (سواء من triggers الحجز في v3 أو من broadcast الأدمن)، Database Webhook يستدعي Edge Function ترسل push لكل أجهزة المستخدم النشطة.

## ما الذي تغيّر؟

- ✅ تثبيت `expo-notifications` و `expo-device` + ضبط `app.json` (plugin، notification icon/color، defaultChannel).
- ✅ مكتبة `lib/push.ts`: تسجيل/إلغاء التوكن، Android channel، listener لمس الإشعار.
- ✅ `AuthContext` يسجّل توكن الجهاز تلقائياً عند بدء الجلسة، ويعطّله عند تسجيل الخروج.
- ✅ بعد إكمال الملف الشخصي يظهر **modal "تفعيل الإشعارات؟"** (مرّة واحدة فقط — لو رفض، يقدر يفعّل لاحقاً من حسابي).
- ✅ في **حسابي** → صف "الإشعارات" بـ **Switch** يفعّل/يعطّل push لهذا الجهاز.
- ✅ Deep linking: لمس الإشعار يفتح `/booking/{id}` لو فيه `booking_id` في الـ payload.
- ✅ Edge Function `send-push` تستقبل webhook → تجلب tokens النشطة → ترسل عبر Expo Push API → تعطّل tokens "DeviceNotRegistered" تلقائياً.
- ✅ broadcast الأدمن (notifications.user_id = null) يُرسَل لكل المستخدمين الذين لديهم tokens نشطة.

## الإعداد المطلوب من جهتك (مرّة واحدة)

### 1) إنشاء EAS project (للحصول على projectId)
في مجلد `artifacts/farah`:

```bash
pnpm exec eas init
```

سيطلب تسجيل دخول Expo ثم ينشئ projectId ويضيفه تلقائياً إلى `app.json` تحت `extra.eas.projectId`.

> لا تحتاج EAS Build أو Submit الآن — فقط `init` يكفي للحصول على projectId الذي يستخدمه Expo Push.

### 2) تثبيت Supabase CLI ونشر Edge Function

#### تثبيت CLI
```bash
# macOS
brew install supabase/tap/supabase

# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# أو عبر npm (لكل المنصات)
npm install -g supabase
```

#### تسجيل دخول وربط المشروع
```bash
cd artifacts/farah
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

`<YOUR_PROJECT_REF>` تجده في URL مشروعك في Supabase Dashboard (مثلاً `xxxxxxxx.supabase.co` → `xxxxxxxx`).

#### نشر الـ Function
```bash
supabase functions deploy send-push --no-verify-jwt
```

`--no-verify-jwt` ضروري لأن الويبهوك يستدعي الـ function بـ Authorization Bearer مخصص (لا JWT عادي).

### 3) ضبط أسرار الـ Function

من **Supabase Dashboard → Edge Functions → send-push → Secrets** أضف:

| المفتاح | القيمة |
|---|---|
| `SUPABASE_URL` | URL مشروعك (مثل `https://xxxxxxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | الـ service role key (Settings → API → service_role) |
| `PUSH_WEBHOOK_SECRET` | سلسلة عشوائية تختارها (مثل output من `openssl rand -hex 32`) — تستخدمها كـ Authorization في الويبهوك |

> **مهم**: لا تشارك service_role_key أبداً. يبقى فقط في الـ Function (server-side).

### 4) إنشاء الـ Database Webhook

في **Supabase Dashboard → Database → Webhooks → Create a new hook**:

- **Name**: `dispatch_push`
- **Table**: `notifications`
- **Events**: ☑ Insert
- **Type**: HTTP Request
- **Method**: `POST`
- **URL**: `https://<YOUR_PROJECT_REF>.functions.supabase.co/send-push`
- **HTTP Headers**:
  - `Authorization`: `Bearer <PUSH_WEBHOOK_SECRET>` (نفس القيمة من خطوة 3)
- **HTTP Params**: (اتركه فاضي)
- **Body**: (default — Supabase يرسل `{ type, table, schema, record, old_record }`)

اضغط **Confirm**.

### 5) ⚠️ مهم — Expo Go لا تدعم Push بعد SDK 53
شركة Expo حذفت دعم Remote Push من تطبيق Expo Go العام. على Expo Go:
- شاشة "تفعيل الإشعارات" بعد الـ profile setup **لا تظهر**.
- صف "الإشعارات" في "حسابي" **مخفي**.
- التطبيق يشتغل بشكل طبيعي عدا أن push على الجوال لن يصل.
- الإشعارات داخل التطبيق (Realtime + قائمة الإشعارات) **تشتغل عادي**.

التطبيق يكتشف بيئة Expo Go تلقائياً عبر `Constants.executionEnvironment === 'storeClient'` ولا يحاول تحميل `expo-notifications` هناك (لأن مجرد الاستيراد كان يكسّر التطبيق على Android).

#### لتجربة push على الجوال — استخدم Development Build
```bash
cd artifacts/farah
pnpm exec eas build --profile development --platform android
# أو
pnpm exec eas build --profile development --platform ios
```

هذي تنشئ نسخة مخصصة من التطبيق فيها كل الـ native modules (بما فيها expo-notifications). تثبّتها على جهازك مرة واحدة، وبعدها push يشتغل بالكامل.

#### للبناء الإنتاجي (production)
- **iOS**: تحتاج Apple Developer + APNs key. اتبع [Expo iOS push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/#ios-credentials).
- **Android**: تحتاج Firebase project + `google-services.json`. اتبع [Expo Android push setup](https://docs.expo.dev/push-notifications/fcm-credentials/).

التفاصيل الكاملة لـ EAS Build + APNs + FCM تأجّل لمرحلة 8 (Polish + QA + builds).

## كيف تختبر

### اختبار سريع عبر Expo Go (بدون APNs/FCM)

1. شغّل التطبيق على هاتف فعلي عبر Expo Go (push **لا يعمل** على المحاكي/المتصفح).
2. سجّل دخول → أكمل البيانات → **اضغط "تفعيل الإشعارات"** في الـ modal.
3. تحقق من DB أن `push_tokens` فيه صف لمستخدمك بـ `is_active=true` و token يبدأ بـ `ExponentPushToken[...]`.
4. من حساب آخر، احجز خدمة عند المزود → **يصل الإشعار للمزود فوراً** على الجوال.
5. اضغط الإشعار → يفتح `/booking/{id}` مباشرة.
6. **اختبار broadcast**: من حساب أدمن، استخدم شاشة `/admin/broadcast` لإرسال إشعار جماعي → يصل لكل من فعّل push.

### اختبار يدوي عبر curl (للتحقق من Function)

```bash
curl -X POST https://<YOUR_PROJECT_REF>.functions.supabase.co/send-push \
  -H "Authorization: Bearer <PUSH_WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "notifications",
    "schema": "public",
    "record": {
      "id": "00000000-0000-0000-0000-000000000000",
      "user_id": "<USER_DB_ID>",
      "title": "اختبار",
      "body": "هذا إشعار تجريبي",
      "booking_id": null
    }
  }'
```

الاستجابة المتوقعة: `{"sent": N, "deactivated": 0}` حيث N = عدد الأجهزة النشطة لهذا المستخدم.

## نقاط معمارية مهمة

### لماذا Database Webhook بدلاً من pg_net trigger داخل SQL؟
- أسهل: لا حاجة لتخزين secrets داخل DB أو ضبط `app.settings.*` keys.
- أوضح: الويبهوك مرئي في Dashboard، يقدر الأدمن يعطّله/يعدّله بدون migration.
- يحتفظ بـ retry logic مدمج في Supabase Webhooks.

### لماذا لا نسجّل token تلقائياً بدون استئذان؟
- iOS و Android كلاهما يتطلب `requestPermissionsAsync()` صريح. مرة واحدة فقط (لو رفض، النظام لا يعيد السؤال).
- نسأل بعد إكمال الملف الشخصي (سياق طبيعي) بدل ما نسأل في أول فتحة قبل ما يدخل التطبيق.
- لما المستخدم يدخل من جهاز جديد بنفس الحساب، AuthContext يسجّل تلقائياً (إذا الإذن ممنوح من قبل) ويُعرّف Supabase بالجهاز الجديد عبر `push_tokens` upsert.

### Auto-cleanup للـ tokens الميتة
الـ Function تتحقق من Expo tickets — لو رجع `DeviceNotRegistered` (مستخدم حذف التطبيق أو سحب الإذن من إعدادات الجهاز)، نضع `is_active=false` تلقائياً. ما نحاول نرسل لها مرة ثانية.

## استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| `push_tokens` فاضي بعد قبول الإذن | تأكد من EAS projectId موجود في `app.json` (`extra.eas.projectId`). شغّل `eas init` لو ما عندك. |
| Function يرجع 401 | تأكد إن `PUSH_WEBHOOK_SECRET` في Function Secrets مطابق للـ `Authorization` header في الويبهوك. |
| Function يرجع 200 لكن ما يصل push | تأكد إن `is_active=true` في `push_tokens` للمستخدم. وفعلاً Token يبدأ بـ `ExponentPushToken[`. واختبر من Expo Push Tool: https://expo.dev/notifications |
| Push يصل لكن اللمس ما يفتح صفحة الحجز | تحقق من `data.booking_id` في الـ payload (Expo Notifications dev tools يعرضه). الـ deep linking في `_layout.tsx` يعتمد على `booking_id`. |
| Function logs تظهر "unexpected Expo response" | عادة يحدث لو ضبط الإعدادات صحيح بس Expo قاعد يقدّم rate-limited. شيك Expo dashboard. |
| `Failed to get Expo push token` على Expo Go | بعض إصدارات Expo Go لا تدعم push بدون projectId. تأكد إن `app.json` مكتمل. |

## ما القادم؟
- **المرحلة 7**: Support tickets + About + لوحة الأدمن (إدارة المستخدمين، تقارير، رد على التذاكر).
- **المرحلة 8**: Polish + QA + EAS Builds (production credentials، APNs، FCM، loading states، a11y).
- **micro-phase Moyasar** (اختياري بأي وقت): تكامل بوابة الدفع الفعلي.
