# فرح (Farah) — دليل الإعداد للمرحلتين 1 و 2

هذا الدليل يشرح خطوات تشغيل تطبيق فرح بـ **Backend حقيقي** على Supabase، مع نظام تسجيل دخول حقيقي عبر البريد الإلكتروني وكلمة المرور + رمز تحقق + شاشة إكمال البيانات.

> **ما الذي اكتمل في هذه الجلسة (المرحلة 1 + 2)؟**
> - Schema SQL محدّث بالحقول الجديدة (الإيميل، الصورة، الجنس، العمر، اللغة، علم إكمال البيانات) + جداول جديدة (push_tokens, support_tickets, app_content)
> - AuthContext مُعاد كتابته ليستخدم Supabase session حقيقي (لا توجد بيانات وهمية أو رمز تجريبي)
> - شاشة تسجيل الدخول الجديدة (إيميل + كلمة مرور)
> - شاشة إنشاء حساب جديد (إيميل + كلمة مرور)
> - شاشة رمز التحقق (٦ أرقام تصل للإيميل من Supabase)
> - شاشة إكمال البيانات الإلزامية (الاسم، الجوال، الصورة، الجنس، العمر، اللغة)
> - نقطة حمراء على "بياناتي" لو ما اكتملت البيانات
> - بوابة Auth في `_layout.tsx` تجبر المستخدم يكمل بياناته قبل دخول التطبيق

---

## الخطوة 1 — إنشاء مشروع Supabase

1. ادخل [supabase.com](https://supabase.com) وأنشئ مشروع جديد.
2. اختر **اسم** للمشروع (مثلاً `farah-prod`)، **منطقة قريبة** (مثل Frankfurt للسعودية).
3. اختر كلمة مرور قاعدة البيانات واحفظها.
4. انتظر دقيقة-دقيقتين حتى يكتمل الإنشاء.

## الخطوة 2 — تشغيل الـ Schema الأصلي

من قائمة Supabase اختر **SQL Editor → New query**:

1. انسخ محتوى الملف [`attached_assets/farah_supabase_schema.sql`](attached_assets/farah_supabase_schema.sql) كاملاً.
2. ألصقه في المحرر واضغط **Run**.
3. سيُنشئ الجداول (users, categories, providers, services, bookings, reviews, notifications, app_settings) مع RLS وبيانات التصنيفات.

## الخطوة 3 — تشغيل migration الجديدة (المرحلة 1+2)

نفس المحرر، **New query** جديد:

1. انسخ محتوى [`attached_assets/farah_supabase_migration_v2.sql`](attached_assets/farah_supabase_migration_v2.sql).
2. ألصقه واضغط **Run**.
3. هذه الـ migration:
   - تضيف حقول للملف الشخصي على جدول `users` (email, avatar_url, gender, age, language, profile_completed)
   - تضيف أعمدة `_ar`/`_en` للتصنيفات والمزودين والخدمات (لدعم اللغتين في المرحلة 3)
   - تنشئ جدول `push_tokens` للإشعارات
   - تنشئ جدول `support_tickets` لتذاكر الدعم
   - تنشئ جدول `app_content` لمحتوى "حول التطبيق"
   - تضيف **trigger تلقائي** ينشئ صف في `public.users` عند تسجيل أي مستخدم جديد في `auth.users`

## الخطوة 4 — إنشاء Storage bucket للصور

1. من قائمة Supabase: **Storage → New bucket**.
2. الاسم: `avatars`
3. ضع علامة **Public bucket** (مهم — حتى تظهر الصورة في التطبيق).
4. اضغط Create.

ثم من نفس صفحة الـ bucket، اذهب لـ **Policies** وأنشئ سياسة:
- **Allow authenticated users to upload to their own folder:**
  - Operation: INSERT
  - Target roles: authenticated
  - Policy definition: `bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text`
- **Allow public read:**
  - Operation: SELECT
  - Target roles: public
  - Policy definition: `bucket_id = 'avatars'`

## الخطوة 5 — تفعيل Email Auth

من قائمة Supabase: **Authentication → Providers → Email**

تأكد:
- ✅ Enable Email provider — **مفعّل**
- ✅ Confirm email — **مفعّل** (هذا ما يجعل Supabase يرسل رمز التحقق ٦ أرقام)
- ✅ Secure email change — مفعّل (افتراضي)

ثم **Authentication → Email Templates → Confirm signup** — تأكد أن القالب يحتوي على `{{ .Token }}` (وليس `{{ .ConfirmationURL }}`)؛ هذا يجعل المستخدم يدخل الرمز يدوياً في التطبيق بدل الضغط على رابط.

اقتراح للقالب:
```html
<h2>أهلاً بك في فرحتكم</h2>
<p>رمز التحقق الخاص بك:</p>
<h1 style="letter-spacing: 8px; font-family: monospace;">{{ .Token }}</h1>
<p>الرمز صالح لمدة ١٠ دقائق.</p>
```

## الخطوة 6 — أخذ مفاتيح Supabase

من قائمة Supabase: **Project Settings → API**

انسخ:
- **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- **anon public** key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## الخطوة 7 — إنشاء ملف `.env`

في مجلد `artifacts/farah/`:

```bash
cp .env.example .env
```

ثم افتح `.env` واملأ القيم:

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

## الخطوة 8 — تشغيل التطبيق

```bash
cd artifacts/farah
pnpm install     # لو ما عملته بعد
pnpm run dev
```

ثم اختر **Press w** للويب أو امسح QR للجوال.

---

## اختبار التدفق

عند فتح التطبيق ستظهر **شاشة تسجيل الدخول**:

1. اضغط **"أنشئ حساباً"**.
2. أدخل بريد إلكتروني حقيقي + كلمة مرور (٨ أحرف فأكثر) + تأكيد كلمة المرور.
3. اضغط **"إنشاء الحساب"**.
4. سيُحوَّلك للشاشة التي تطلب رمز التحقق (٦ أرقام).
5. افتح بريدك — ستجد رسالة من Supabase فيها الرمز. ألصقه.
6. اضغط **"تأكيد"**.
7. سيُحوَّلك تلقائياً لشاشة **"أكمل بياناتك"** الإلزامية.
8. أدخل: الاسم، رقم الجوال، اختر صورة، الجنس، العمر، اللغة.
9. اضغط **"حفظ ومتابعة"**.
10. يدخلك التطبيق على الواجهة الرئيسية.
11. روح **"حسابي"** — لاحظ أن النقطة الحمراء على "بياناتي" اختفت.

عند تسجيل الخروج وإعادة الدخول — سيُسأل عن الإيميل وكلمة المرور فقط (بدون OTP)، ويدخلك مباشرة لأن البيانات مكتملة.

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| "Supabase ليس مهيأً" | تحقق من ملف `.env` ومن أن المفاتيح صحيحة. أعد تشغيل `pnpm run dev` بعد تعديل `.env`. |
| رسالة "Email not confirmed" | المستخدم لم يُكمل OTP بعد. التطبيق يحوّله لشاشة OTP تلقائياً. |
| الرمز ما يصل للإيميل | تحقق من Spam. تحقق من إعدادات SMTP في Supabase (Settings → Auth → SMTP Settings) — Supabase يضع حد ٣-٤ إيميلات في الساعة لـ free tier؛ إذا تجاوزت الحد، فعّل SMTP خاص بك (Resend / SendGrid). |
| الصورة ما ترفع | تأكد من إنشاء bucket `avatars` بـ Public + سياسات الـ INSERT والـ SELECT. |
| Profile setup يطلب الإكمال كل مرة | هذا يعني `profile_completed=false` في DB. تحقق من الجدول `public.users` يدوياً عبر Supabase Studio. |

---

## ما القادم؟

أنهيت **المرحلتين 1 و 2**. عند تأكيدك أن التدفق يعمل، نبدأ **المرحلة 3** (i18n عربي/إنجليزي + إصلاح RTL في الويب) في جلسة جديدة.

المراحل المتبقية:
- 3 — i18n
- 4 — Services + Providers (CRUD حقيقي من DB)
- 5 — Booking flow (حالات + UX)
- 6 — Push Notifications
- 7 — Support Tickets + About + Admin Panel
- 8 — Cross-platform polish + QA
