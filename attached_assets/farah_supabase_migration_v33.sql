-- ============================================================
-- migration_v33: terms & conditions for the v30+ payment model
--
-- The v12 T&Cs described the old "platform-held deposit + refundable
-- cancel" model. v30 / v31 changed every line of that paragraph:
--   • No deposit — customer pays the full price upfront.
--   • No cancel/refund — only reschedule.
--   • Money goes straight to the provider's Moyasar account.
--   • Provider owes a 10% commission settled after the service is
--     completed. Late commission → suspension → legal action.
-- This migration replaces the visible app_content rows with text that
-- reflects the new model. The previous text is preserved in the audit
-- log via the existing audit_content_change trigger.
-- ============================================================

begin;

update public.app_content
set
  value_ar = $TXT$"من هنا تبدأ الفرحة… ومعها تبدأ الشراكة"

⸻

1. التعريف العام

تطبيق "فرحتكم" منصة رقمية تربط العملاء بمقدمي خدمات المناسبات وتعمل كوسيط تقني يسهّل عمليات الحجز والدفع وإدارة المواعيد، دون أن يكون طرفاً مباشراً في تقديم الخدمة أو تنفيذها.

⸻

2. آلية الدفع الجديدة

يدفع العميل كامل قيمة الخدمة عند الحجز عبر بوابة ميسر مباشرة إلى الحساب البنكي الخاص بمقدم الخدمة. لا تستلم منصة "فرحتكم" قيمة الخدمة في أي مرحلة، ولا تحتفظ بأي مبالغ نيابة عن مقدم الخدمة.

⸻

3. عمولة المنصة

يلتزم مقدم الخدمة بسداد عمولة المنصة بعد إكمال تنفيذ الخدمة، وقيمتها 10٪ من إجمالي قيمة الخدمة. تُسدَّد العمولة عبر لوحة تحكم مقدم الخدمة بفاتورة ميسر تخص حساب المنصة.

⸻

4. التزام السداد والإجراءات على المتأخرين

عدم سداد العمولة في الموعد يُعرّض الحساب لما يلي:
• إشعار تذكير بعد 7 أيام من إتمام الخدمة.
• إنذار رسمي بعد 14 يوماً تنبيهاً بقرب التعليق.
• تعليق تلقائي للحساب بعد 30 يوماً من تاريخ الاستحقاق، ويُمنع المتجر من استقبال أي حجوزات جديدة حتى السداد.
• في حال استمرار التأخر، يحق للمنصة اتخاذ كافة الإجراءات القانونية اللازمة لاسترداد المستحقات، ومنها التقدّم بشكوى إلى الجهات المختصة في المملكة العربية السعودية وتحميل مقدم الخدمة مصاريف التقاضي.

⸻

5. الإلغاء والاسترداد

لا يُسمح بإلغاء الحجوزات بعد تأكيدها من قِبل العميل، وفي حال الحاجة لتغيير الموعد يتاح خيار إعادة الجدولة وفق الشروط التالية:
• يجب أن يكون المتبقي على الموعد الأصلي أكثر من 48 ساعة.
• يُعرض الموعد البديل على مقدم الخدمة للموافقة.
• يجب أن يكون الموعد البديل متاحاً في جدول مقدم الخدمة (لا يتعارض مع حجوزات أو فترات حجب).
• في حال رفض مقدم الخدمة، يبقى الحجز في موعده الأصلي.

⸻

6. مسؤولية تنفيذ الخدمة

يتحمّل مقدم الخدمة كامل المسؤولية عن جودة وحسن تنفيذ الخدمة. يحق للعميل تقييم الخدمة بعد إكمالها، وقد يؤثر التقييم على ظهور المتجر للعملاء المحتملين.

⸻

7. حماية البيانات

تتعامل المنصة مع بيانات المستخدمين وفق سياسة الخصوصية ومتطلبات حماية البيانات في المملكة. لا تتم مشاركة بيانات العميل مع مقدم الخدمة إلا بعد تأكيد الدفع.

⸻

8. تعديل الشروط

تحتفظ المنصة بحقها في تعديل الشروط في أي وقت، ويُعَدّ استمرار استخدام التطبيق موافقةً ضمنية على التحديثات.

⸻

بتسجيلك في تطبيق "فرحتكم" أو استخدامك له، فإنك تُقرّ بقراءة هذه الشروط والموافقة عليها صراحة.$TXT$,
  value_en = $TXT$"Where the celebration begins… and the partnership starts"

⸻

1. Overview

Farhatukum is a digital platform that connects customers with event service providers. It acts as a technical intermediary that facilitates bookings, payments, and scheduling, and is not a direct party to the delivery of the service.

⸻

2. New Payment Flow

The customer pays the full service price at the time of booking, via Moyasar, directly into the provider's bank account. Farhatukum never holds the service amount on behalf of the provider.

⸻

3. Platform Commission

The provider commits to settling the platform commission after the service is completed. The commission is 10% of the total service price and is paid via the provider dashboard through a Moyasar invoice on the platform's account.

⸻

4. Late Payment and Enforcement

Failure to settle the commission on time triggers the following:
• A reminder 7 days after the service is completed.
• A formal warning at 14 days notifying that suspension is imminent.
• Automatic suspension at 30 days from the due date — the store cannot receive any new bookings until the balance is paid.
• If non-payment continues, Farhatukum reserves the right to take all necessary legal action to recover the dues, including filing complaints with the competent authorities in the Kingdom of Saudi Arabia and recovering the cost of litigation from the provider.

⸻

5. Cancellation and Refunds

Once confirmed, bookings cannot be cancelled. Where the timing needs to change, the customer may request a reschedule under the following terms:
• More than 48 hours must remain before the original time.
• The new time is offered to the provider for acceptance.
• The new time must be free in the provider's schedule (no overlap with other bookings or blocked windows).
• If the provider declines, the booking stays at its original time.

⸻

6. Service Delivery Responsibility

The provider bears full responsibility for the quality and execution of the service. The customer may rate the service after completion; ratings may affect the visibility of the store to future customers.

⸻

7. Data Protection

Farhatukum handles user data in accordance with its Privacy Policy and the data-protection requirements of the Kingdom. Customer contact details are shared with the provider only after payment is confirmed.

⸻

8. Changes to Terms

Farhatukum reserves the right to amend these terms at any time. Continued use of the app implies acceptance of the updates.

⸻

By registering with or using Farhatukum, you acknowledge that you have read and expressly accepted these terms.$TXT$,
  updated_at = now()
where key = 'terms_conditions';

commit;
