# ربط بوابة ميسر (Moyasar) للمدفوعات - دليل الإعداد النهائي

## 📋 الملخص

تم ربط تطبيق **فرح** مع **بوابة ميسر للمدفوعات (Moyasar)** مع تفعيل:
- ✅ بطاقات الائتمان والخصم (Visa, Mastercard, Mada)
- ✅ Apple Pay (على الأجهزة التي تدعمه)
- ✅ معالجة الرسوم والعمولات تلقائياً
- ✅ نظام استرجاع المدفوعات (Refunds)
- ✅ تحويل العمولات للمقدمين (Payouts)

---

## 🔐 بيانات الاعتماد المستخدمة

```
المفتاح العام (Publishable Key): <your-moyasar-publishable-key>
مفتاح المتجر السري (Secret Key): <your-moyasar-secret-key>
```

---

## ⚙️ خطوات الإعداد النهائي

### الخطوة 1️⃣: إضافة مفاتيح Moyasar إلى Supabase

1. اذهب إلى **[Supabase Dashboard](https://supabase.com/dashboard)**
2. اختر مشروعك
3. اذهب إلى **Project Settings** → **Functions**
4. ابحث عن **Secrets** وأضفها:

| اسم المتغير | القيمة |
|-----------|---------|
| `MOYASAR_SECRET_KEY` | `<your-moyasar-secret-key>` |

#### تأكد من وجود هذه المتغيرات أيضاً:
- `SUPABASE_URL` — رابط مشروع Supabase
- `SUPABASE_ANON_KEY` — المفتاح العام لـ Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — مفتاح Service Role (خطر جداً، لا تشاركه)

### الخطوة 2️⃣: نشر Moyasar Edge Function

في Terminal من جذر المشروع:

```bash
cd artifacts/farah
supabase functions deploy moyasar --no-verify-jwt
```

**ملاحظات:**
- استخدم `--no-verify-jwt` لأننا نتحقق من JWT يدويًا في الكود
- قد تحتاج إلى تسجيل الدخول أولاً: `supabase login`
- ستشاهد رسالة: `✓ Function "moyasar" deployed successfully`

### الخطوة 3️⃣: تفعيل Apple Pay على iOS (اختياري)

إذا أردت تفعيل Apple Pay على التطبيق:

1. في `artifacts/farah/eas.json`، تأكد من وجود:
```json
{
  "build": {
    "preview": {
      "ios": {
        "entitlements": {
          "com.apple.developer.in-app-payments": true
        }
      }
    }
  }
}
```

2. في `artifacts/farah/app.json` (في `expo` section):
```json
{
  "ios": {
    "bundleIdentifier": "com.farah.app",
    "merchant": {
      "applePayId": "merchant.com.farah"
    }
  }
}
```

> **ملاحظة:** Apple Pay سيظهر تلقائياً عند فتح نموذج الدفع على أجهزة iOS

---

## 🔄 آلية عمل المدفوعات

### 1. عملية الإيداع (Booking Deposit)

```
العميل يحجز خدمة
    ↓
يتم حساب الإيداع المطلوب (25% من السعر)
    ↓
ينقر "ادفع الإيداع"
    ↓
يفتح نموذج Moyasar الموثوق (Invoice)
    ↓
اختيار طريقة الدفع (بطاقة/Apple Pay)
    ↓
إدخال بيانات البطاقة أو استخدام Apple Pay
    ↓
الدفع ناجح → يتم تحديث الحجز
```

### 2. عملية الدفع النهائي (Final Payment)

```
المقدم ينهي الخدمة
    ↓
اختيار طريقة الدفع (أونلاين/كاش/تحويل بنكي)
    ↓
إذا "أونلاين" → نفس عملية الإيداع
```

### 3. عمولة التطبيق (Commission)

```
عند تأكيد دفع الإيداع:
    ↓
خصم عمولة التطبيق تلقائياً
    ↓
تحويل حصة المقدم إلى محفظتهم
```

---

## ✅ اختبار المدفوعات (100% تأكد أنه يعمل)

### الاختبار 1️⃣: إنشاء حجز واختبار الإيداع

```
1. سجل دخول كعميل
2. ابحث عن أي خدمة
3. اضغط "احجز الآن"
4. ملأ البيانات والتاريخ
5. اضغط "ادفع الإيداع"
6. في نموذج Moyasar اختر "Credit Card"
7. استخدم رقم اختبار:
   - الرقم: 4111 1111 1111 1111
   - الشهر: أي شهر (مثل 12)
   - السنة: سنة في المستقبل (مثل 25)
   - رمز الأمان: أي 3 أرقام
   
8. يجب أن تظهر صفحة "الدفع ناجح" ✅
```

### الاختبار 2️⃣: التحقق من قاعدة البيانات

في Supabase SQL Editor:

```sql
-- تحقق من أن الدفع تم تسجيله
SELECT id, kind, status, amount_halalas, moyasar_id 
FROM public.payments 
ORDER BY created_at DESC 
LIMIT 5;

-- تحقق من أن الحجز محدّث
SELECT id, payment_status, deposit_paid_at 
FROM public.bookings 
WHERE user_id = (SELECT auth.uid())
ORDER BY created_at DESC 
LIMIT 1;
```

**النتيجة المتوقعة:**
- حالة الدفع: `paid`
- حالة الحجز: `confirmed`

### الاختبار 3️⃣: اختبار استرجاع المدفوعات (Refunds) - Admin فقط

```
1. سجل دخول كـ Admin
2. اذهب إلى "إدارة" → "استرجاعات"
3. ابحث عن حجز بحالة "مؤكد"
4. اضغط "استرجاع الإيداع"
5. يجب أن تظهر رسالة النجاح ✅
```

---

## 🔧 استكشاف الأخطاء

### ❌ خطأ: "moyasar_not_configured"

**السبب:** متغير `MOYASAR_SECRET_KEY` غير موجود
**الحل:**
1. تأكد من إضافة المتغير في Supabase Secrets
2. أعد نشر الـ Edge Function:
   ```bash
   supabase functions deploy moyasar --no-verify-jwt
   ```

### ❌ خطأ: "payment_not_found"

**السبب:** معرّف الدفع خاطئ أو محذوف
**الحل:** تحقق من أن الحجز موجود وأن المستخدم مالكه

### ❌ خطأ: "moyasar_create_failed"

**السبب:** الاتصال بـ Moyasar فشل
**الحل:**
1. تحقق من أن مفتاح Moyasar صحيح
2. تحقق من اتصالك بالإنترنت
3. تحقق من حالة خوادم Moyasar

### ❌ Apple Pay لا يظهر

**السبب:** الجهاز غير مدعوم أو الإعدادات خاطئة
**الحل:**
1. جرب على جهاز iPhone حقيقي (ليس محاكي)
2. تأكد من تفعيل Wallet على الجهاز
3. جرب نموذج Moyasar مباشرة للتحقق

---

## 📊 معدلات العمولات الحالية

| النوع | النسبة | ملاحظات |
|------|--------|---------|
| الإيداع (Deposit) | 25% | يحتفظ التطبيق ب 5%، الباقي للمقدم |
| الدفع النهائي | 5% | من المبلغ المتبقي |
| استرجاع المدفوعات | 0% | استرجاع كامل للعميل |

---

## 🚀 نصائح مهمة

1. **استخدم بيانات اختبار Moyasar أثناء التطوير**
   - الأرقام المزيفة تعمل فقط في بيئة الاختبار
   - تحقق من وثائق Moyasar للأرقام المختبرة

2. **تفعيل HTTPS في الإنتاج**
   - جميع اتصالات الدفع يجب أن تكون عبر HTTPS
   - Moyasar يرفض HTTP

3. **الاحتفاظ بـ Secret Key آمناً**
   - لا تشاركه في الكود العام
   - لا تضعه في ملفات Git
   - استخدم Supabase Secrets فقط

4. **مراقبة المدفوعات**
   - افحص لوحة تحكم Moyasar يومياً
   - تحقق من قائمة الأخطاء والمحاولات الفاشلة
   - احتفظ بسجل للتحويلات والاسترجاعات

---

## 📞 الدعم والمساعدة

إذا واجهت مشاكل:

1. **تحقق من لوحة تحكم Moyasar:** [dashboard.moyasar.com](https://dashboard.moyasar.com)
2. **اقرأ وثائق Moyasar API:** [docs.moyasar.com](https://docs.moyasar.com)
3. **تواصل مع Moyasar Support:** support@moyasar.com

---

## ✨ الحالة الحالية

```
✅ ربط بوابة ميسر (Moyasar) - مُفعّل
✅ معالجة الفواتير والدفع - مُفعّل
✅ Apple Pay - مُفعّل (يظهر على الأجهزة المدعومة)
✅ نظام الرسوم والعمولات - مُفعّل
✅ الاسترجاعات والتحويلات - مُفعّل
✅ قاعدة البيانات وتتبع المدفوعات - مُفعّل
```

**آخر تحديث:** June 4, 2026

---

Generated with ❤️ for Farah App Team
