# فرح (Farah) — دليل المرحلة 5

> هذه المرحلة تُحوّل تجربة الحجز من "نصوص ثابتة" إلى **slots حقيقية مبنية على ساعات عمل المزود ومدّة الخدمة، مع منع تداخل الحجوزات على مستوى DB**. وتجهّز بنية الدفع للتكامل مع Moyasar لاحقاً.

## ما الذي تغيّر؟

- ✅ كل مزود يحدّد **ساعات العمل** لكل يوم في الأسبوع (شاشة جديدة `/provider-zone/availability`).
- ✅ كل خدمة لها **`duration_minutes`** (مدة بالدقائق) — ضروري لحساب الـ slots.
- ✅ الحجوزات تخزّن `start_at` و `end_at` (timestamptz) — تم **حذف** الحقول القديمة `event_date` و `event_time` نهائياً.
- ✅ شاشة الحجز تعرض **slots ديناميكية** مبنية على: ساعات عمل المزود لذلك اليوم – مدة الخدمة – الحجوزات المتداخلة (pending أو accepted).
- ✅ **منع التداخل على مستوى DB** عبر `EXCLUDE constraint` (يحجز الـ slot من حالة pending). أي محاولة حجز slot مأخوذ ترجع خطأ `"هذا الموعد لم يعد متوفراً"`.
- ✅ **Modal تأكيد** قبل إرسال الحجز يعرض ملخصاً: الخدمة، المزود، التاريخ، الوقت، المدينة، الإجمالي.
- ✅ بنية الدفع جاهزة: `payment_status` (enum: pending/paid/refunded/failed) + `payment_method` + `payment_id`. شاشة تفاصيل الحجز تعرض الحالة كـ badge.
- ✅ RPC جديد `provider_busy_intervals(p_id, day)` يجلب الفترات المحجوزة بأمان دون كشف بيانات العملاء.

## الخطوة الوحيدة الجديدة في Supabase

في **SQL Editor → New query** نفّذ:

[`attached_assets/farah_supabase_migration_v4.sql`](attached_assets/farah_supabase_migration_v4.sql)

ما يفعله بالترتيب:
1. يفعّل extension `btree_gist` (لـ EXCLUDE constraint).
2. يضيف `providers.working_hours` (JSONB) بقيمة افتراضية (مفتوح كل يوم 09:00-22:00، الجمعة 13:00-23:00).
3. يضيف `services.duration_minutes` (INT، افتراضي 60، نطاق 15-1440).
4. يضيف `bookings.start_at` و `bookings.end_at`، يهجّر البيانات القديمة (event_date + 12:00 افتراضياً)، **يحذف** `event_date` و `event_time`، يضيف فهرس على `start_at`.
5. يضيف `EXCLUDE constraint` يمنع تداخل الحجوزات على نفس المزود في حالات pending/accepted.
6. يضيف `payment_status` enum + `payment_method` + `payment_id` على `bookings`.
7. ينشئ RPC `provider_busy_intervals` (SECURITY DEFINER) لجلب الـ slots المحجوزة لمزود في يوم محدد.

## بعد التنفيذ — كيف تختبر

### 1) إعداد المزود
1. سجّل دخول كمزود (أو نفّذ onboarding من حساب عميل).
2. **`/provider-zone`** → **"خدماتي"** → عدّل خدمة موجودة أو أضف جديدة:
   - اسم، سعر، وصف المدة (نص حر للعرض، مثل "4 ساعات")
   - **مدة الخدمة بالدقائق** (مثل `240` لأربع ساعات) — هذي اللي تحدد طول كل slot في شاشة الحجز.
3. ارجع → **"ساعات العمل"** → عدّل ساعات كل يوم. الأيام المغلقة لن تظهر في شاشة الحجز.

### 2) تجربة الحجز (customer)
1. سجّل دخول كعميل آخر، اختر المزود → **احجز الآن**.
2. اختر يوماً → ستظهر **slots ديناميكية** كل 30 دقيقة (مثلاً لو ساعات العمل 09:00-22:00 ومدة الخدمة 60 دقيقة، يظهر slots من 09:00 إلى 21:00).
3. اختر slot، أكمل المدينة + رابط Google Maps + ملاحظات.
4. اضغط **"تأكيد الحجز"** → يظهر **مودال التأكيد** بملخص الحجز.
5. اضغط **"تأكيد الإرسال"** → يُكتب الحجز في DB.
6. **التحقق من منع التداخل**: من حساب آخر، حاول حجز نفس الـ slot. النظام يمنعه ويرسل رسالة *"هذا الموعد لم يعد متوفراً"*.

### 3) تجربة المزود (Realtime)
- لما يجي طلب حجز، يصل المزود إشعار (من المرحلة 4)، والـ slot يصير محجوزاً للعملاء الآخرين.
- لو المزود **رفض** الحجز → الـ slot يتحرّر فوراً للعملاء الآخرين (constraint يطبّق فقط على pending/accepted).
- لو **قبل** الحجز → يبقى محجوزاً.
- لو **ألغى العميل** → يتحرّر.

### 4) حالة الدفع
- في تفاصيل أي حجز، يظهر badge "بانتظار الدفع" (لون أصفر).
- لو غيّرت `payment_status` يدوياً في Supabase Studio إلى `'paid'`، يحدّث في الواجهة (Realtime).
- التكامل الفعلي مع Moyasar (إنشاء invoice، redirect، callback لتأكيد الدفع) سيكون في المرحلة التالية أو micro-phase منفصلة.

## نقاط معمارية مهمة

### لماذا EXCLUDE constraint بدلاً من trigger؟
- أسرع وأكثر أماناً من trigger يدوي.
- يلتقط race conditions (عميلان يحجزان نفس الـ slot في نفس اللحظة) تلقائياً عبر قفل DB.
- يطبّق فقط على `status IN (pending, accepted)` — الرفض/الإلغاء/الإكمال يتركون الـ slot.

### لماذا RPC `provider_busy_intervals` بـ SECURITY DEFINER؟
- العميل يحتاج يعرف وش محجوز عشان يفلتر slots غير المتاحة.
- لكن RLS الحالية على `bookings` تمنع العميل من رؤية حجوزات الآخرين.
- الحل: RPC ترجع فقط `(start_at, end_at)` — لا `user_id`، لا `service_title`، لا أسماء — يكشف فقط ما هو ضروري لحساب الـ availability.

### الـ Slot granularity
- ثابت **30 دقيقة** افتراضياً في `lib/data.ts → generateSlots()`.
- يمكن تخصيصها لاحقاً عبر إضافة عمود `providers.slot_interval_minutes`.

## استكشاف الأخطاء

| المشكلة | السبب المحتمل |
|---|---|
| "هذا الموعد لم يعد متوفراً" بشكل دائم | اعمل refresh — ربما عميل آخر حجز في نفس الوقت. الـ slot المحجوز ما يظهر بعد الـ refresh. |
| لا تظهر slots لأي يوم | تحقق من ساعات العمل (المزود نسي يضبطها أو وضع كل الأيام مغلقة)، أو `duration_minutes` للخدمة أكبر من ساعات العمل المتاحة. |
| `permission denied for function provider_busy_intervals` | تأكد إن `migration_v4` نُفّذ بنجاح (يمنح `EXECUTE` لـ `authenticated, anon`). |
| `column "event_date" does not exist` بعد الترقية | متوقع — تم حذفه. تأكد إن كل الكود محدّث (يجب أن يستخدم `start_at`/`end_at`). |
| `btree_gist extension not found` | شغّل `CREATE EXTENSION IF NOT EXISTS "btree_gist";` يدوياً من SQL Editor (يحتاج صلاحيات). |

## ما القادم؟
- **تكامل Moyasar**: عند تأكيد الحجز يُنشأ invoice بسعر الخدمة، redirect للعميل لإتمام الدفع، callback يحدّث `payment_status` إلى `paid`. سياسة المزود يقبل/يرفض بعد تأكيد الدفع فقط.
- **المرحلة 6**: Push Notifications (Expo) — يبني فوق `push_tokens` الموجود من v2 + الإشعارات الموجودة في DB.
- **المرحلة 7**: Support tickets + About + لوحة الأدمن.
