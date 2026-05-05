-- ============================================================
-- فرحتكم | Farhatukum — Migration v12
-- استبدال نص الشروط والأحكام بالنسخة الرسمية الكاملة
-- نفّذ بعد migration_v11 في SQL Editor
-- ============================================================
-- يحدّث صف terms_conditions في public.app_content بنسخة المالك
-- النهائية. الـ trigger الموجود (audit_content_change من v6) سيسجّل
-- التحديث في audit_log باسم الـ admin اللي شغّل الـ migration.
--
-- ملاحظة على التنسيق: حوّلت العلامات النجمية (*) إلى • لتُعرض
-- بشكل أنظف داخل عارض الوثائق في التطبيق (لا يفسّر markdown).
-- ============================================================

update public.app_content
set
  value_ar = $TXT$"من هنا تبدأ الفرحة… ومعها تبدأ الشراكة"

⸻

1. التعريف العام

تطبيق "فرحتكم" هو منصة رقمية متخصصة في ربط العملاء بمقدمي خدمات المناسبات، ويعمل كوسيط تقني يسهّل عمليات الحجز والتنظيم، دون أن يكون طرفًا مباشرًا في تنفيذ الخدمة.

⸻

2. مبدأ الشراكة

يقوم تطبيق "فرحتكم" على مبدأ أن:
التطبيق ومقدم الخدمة شركاء نجاح، حيث يوفّر التطبيق منصة انتشار واسعة، ويقدّم مقدم الخدمة جودة الأداء، ويكتمل النجاح بتكامل الطرفين.

⸻

3. دور التطبيق

يلتزم التطبيق بـ:
• توفير منصة تقنية آمنة ومستقرة
• تسهيل عمليات الحجز والدفع
• دعم التسويق والوصول لمقدمي الخدمات
• إدارة الطلبات والمتابعة باحترافية
• توفير نظام تقييم يعزز الشفافية

⸻

4. التزامات مقدم الخدمة

يلتزم مقدم الخدمة بـ:
• تنفيذ الخدمة بالجودة المتفق عليها
• الالتزام بالمواعيد والتفاصيل
• التعامل الاحترافي مع العملاء
• الحفاظ على سمعة التطبيق وتعزيزها

⸻

5. التزامات العميل

يلتزم العميل بـ:
• تقديم معلومات صحيحة ودقيقة
• الالتزام بشروط الحجز والدفع
• احترام مواعيد التنفيذ
• التعاون مع مقدم الخدمة لإنجاح المناسبة

⸻

6. الحجوزات العاجلة

• تُعد الحجوزات التي تتم قبل موعد المناسبة بفترة قصيرة حجوزات عاجلة
• تعتمد على توفر مقدم الخدمة وجاهزيته
• تقل فيها فرص التعديل أو الإلغاء
• يتحمل العميل مسؤولية تأكيد الحجز بشكل نهائي

⸻

7. سياسة الإلغاء والاسترجاع

تعتمد سياسة الإلغاء على توقيت الطلب كما يلي:

• قبل 10 أيام أو أكثر:
    استرجاع كامل العربون بعد خصم رسوم التطبيق
• من 5 إلى 9 أيام:
    استرجاع 50٪ من العربون + خصم رسوم التطبيق
• أقل من 5 أيام:
    لا يحق استرجاع العربون

⸻

8. الظروف الطارئة والقاهرة

في حال وقوع ظروف خارجة عن الإرادة مثل:
(الحوادث – الوفاة – الظروف القاهرة)

• يحق للعميل رفع طلب للإدارة
• تقوم الإدارة بدراسة الحالة
• يحق للإدارة اتخاذ القرار المناسب، مثل:
    – إعادة الجدولة
    – تعديل الموعد
    – استرجاع كلي أو جزئي

وذلك بما يحقق العدالة ويحفظ حقوق الجميع.

⸻

9. الرسوم والعمولات

• يحدد التطبيق نسبة العمولة بشكل واضح قبل إتمام الحجز
• تُخصم رسوم التطبيق في جميع حالات الاسترجاع
• يوافق جميع الأطراف على هذه النسب عند إتمام الحجز

⸻

10. الدفع والمحفظة

• يتم الدفع عبر وسائل الدفع المعتمدة داخل التطبيق
• يحتفظ التطبيق بالمبالغ مؤقتًا لضمان تنفيذ الخدمة
• يتم تحويل المستحقات لمقدم الخدمة بعد إتمام الحجز بنجاح
• يحق للإدارة اعتماد آلية التحويل التلقائي حسب النظام

⸻

11. التقييم والجودة

• يحق للعميل تقييم مقدم الخدمة
• تؤثر التقييمات على ظهور مقدم الخدمة داخل التطبيق
• يحق للإدارة اتخاذ إجراءات بحق الخدمات منخفضة الجودة

⸻

12. إخلاء المسؤولية

• التطبيق وسيط تقني لتنظيم الحجز
• مقدم الخدمة مسؤول عن تنفيذ الخدمة
• لا يتحمل التطبيق أي تقصير خارج عن نطاقه التقني

⸻

13. التعديلات

يحتفظ تطبيق "فرحتكم" بحق تعديل هذه الشروط والأحكام في أي وقت، بما يحقق تطوير الخدمة ورفع جودة التجربة.

⸻

14. الموافقة

يُعد استخدام التطبيق أو إتمام الحجز موافقة صريحة على جميع الشروط والأحكام المذكورة أعلاه.

⸻

"فرحتكم… منصة تجمع الشركاء لصناعة فرح لا يُنسى"
$TXT$,
  value_en = $TXT$"Where joy begins… and partnership begins with it"

⸻

1. General Definition

The "Farhatukum" app is a digital platform specialized in connecting customers with event service providers. It operates as a technical intermediary that facilitates booking and organization, without being a direct party in service delivery.

⸻

2. Partnership Principle

Farhatukum operates on the principle that:
The app and the service provider are partners in success — the app delivers wide reach, and the provider delivers quality. Success is the product of both sides working together.

⸻

3. The App's Role

The app commits to:
• Providing a secure and stable technical platform
• Facilitating booking and payment operations
• Supporting marketing and outreach for providers
• Managing requests and follow-ups professionally
• Providing a rating system that enhances transparency

⸻

4. Provider Obligations

The service provider commits to:
• Delivering the service at the agreed-upon quality
• Committing to schedules and details
• Handling customers professionally
• Preserving and enhancing the app's reputation

⸻

5. Customer Obligations

The customer commits to:
• Providing accurate and correct information
• Adhering to booking and payment terms
• Respecting execution schedules
• Cooperating with the provider to ensure event success

⸻

6. Urgent Bookings

• Bookings made shortly before the event are considered urgent
• They depend on the provider's availability and readiness
• Modification or cancellation opportunities are reduced
• The customer is responsible for confirming the booking definitively

⸻

7. Cancellation & Refund Policy

Cancellation policy depends on timing as follows:

• 10 days or more before the event:
    Full deposit refund after deducting app fees
• 5 to 9 days before:
    50% deposit refund + app fees deducted
• Less than 5 days:
    No deposit refund

⸻

8. Emergency & Force Majeure

In case of circumstances beyond control such as:
(accidents – death – force majeure)

• The customer may submit a request to administration
• The administration will review the case
• Administration has the right to take appropriate action, such as:
    – Rescheduling
    – Date adjustment
    – Full or partial refund

This is to achieve fairness and preserve everyone's rights.

⸻

9. Fees & Commissions

• The app discloses the commission rate clearly before booking is finalized
• App fees are deducted in all refund cases
• All parties agree to these rates at the time of booking

⸻

10. Payment & Wallet

• Payment is processed through approved methods within the app
• The app holds funds temporarily to guarantee service delivery
• Funds are transferred to the provider after successful booking completion
• Administration may adopt an automatic transfer mechanism per the system

⸻

11. Rating & Quality

• Customers have the right to rate the provider
• Ratings affect provider visibility within the app
• Administration may take action against low-quality services

⸻

12. Disclaimer

• The app is a technical intermediary for booking organization
• The provider is responsible for service delivery
• The app does not bear any liability outside its technical scope

⸻

13. Modifications

Farhatukum reserves the right to modify these terms and conditions at any time, with the goal of improving service and experience quality.

⸻

14. Consent

Using the app or completing a booking constitutes explicit consent to all terms and conditions stated above.

⸻

"Farhatukum… a platform bringing partners together to craft unforgettable joy."
$TXT$,
  updated_at = now()
where key = 'terms_conditions';

-- ============================================================
-- ✅ Done. اختبر:
--
-- select value_ar from app_content where key = 'terms_conditions';
--
-- ثم افتح التطبيق → "حسابي" → "حول التطبيق" → بطاقة "الشروط والأحكام"
-- وتحقق إنها تعرض النص الجديد.
-- ============================================================
