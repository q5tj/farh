-- ============================================================
-- فرحتكم | Farhatukum — Migration v10
-- Seed terms & conditions + privacy policy app_content keys
-- نفّذ بعد migration_v9 في SQL Editor
-- ============================================================
-- Adds two rows to app_content so the admin can edit them from the
-- consolidated "App Settings" screen, and customers can read them via the
-- public viewer at /legal/<key>.
-- ON CONFLICT (key) DO NOTHING preserves any existing content the admin
-- may have already populated.
-- ============================================================

insert into public.app_content (key, value_ar, value_en) values
  (
    'terms_conditions',
    'الشروط والأحكام'
      || E'\n\n'
      || 'مرحباً بك في تطبيق فرحتكم. باستخدامك للتطبيق فإنك توافق على الالتزام بالشروط والأحكام التالية. يحتفظ مالك التطبيق بحق تعديل هذه الشروط في أي وقت.'
      || E'\n\n'
      || '١. الاستخدام: يلتزم المستخدم بتقديم بيانات صحيحة عند التسجيل وعند إجراء الحجوزات.'
      || E'\n'
      || '٢. الحجز والإلغاء: تخضع الحجوزات لسياسة الإلغاء والاسترداد المعلنة في التطبيق.'
      || E'\n'
      || '٣. العمولة: يتم تطبيق نسبة عمولة على المزودين كما هو مذكور وقت إنشاء الحساب.'
      || E'\n'
      || '٤. المسؤولية: التطبيق وسيط بين العميل ومزود الخدمة، وكل طرف مسؤول عن التزاماته.',
    'Terms & Conditions'
      || E'\n\n'
      || 'Welcome to Farhatukum. By using the app you agree to abide by the following terms. The app owner reserves the right to update these terms at any time.'
      || E'\n\n'
      || '1. Usage: Users must provide accurate information at signup and when booking.'
      || E'\n'
      || '2. Booking & cancellation: Bookings are subject to the cancellation and refund policy stated in-app.'
      || E'\n'
      || '3. Commission: A commission percentage is applied to providers as disclosed at the time of account creation.'
      || E'\n'
      || '4. Liability: The app is an intermediary between customers and service providers; each party is responsible for their own obligations.'
  ),
  (
    'privacy_policy',
    'سياسة الخصوصية'
      || E'\n\n'
      || 'نحترم خصوصيتك. توضح هذه السياسة كيفية جمع واستخدام وحماية بياناتك الشخصية في تطبيق فرحتكم.'
      || E'\n\n'
      || '١. البيانات التي نجمعها: الاسم، البريد الإلكتروني، رقم الهاتف، الموقع (اختياري)، والمستندات التي يرفعها المزودون لأغراض التحقق.'
      || E'\n'
      || '٢. كيف نستخدمها: لتشغيل خدمات الحجز، التواصل بين العميل والمزود، إرسال الإشعارات، والتحقق من المزودين.'
      || E'\n'
      || '٣. مشاركة البيانات: لا نشارك بياناتك مع أطراف ثالثة إلا عند الضرورة لتنفيذ الخدمة أو بموجب القانون.'
      || E'\n'
      || '٤. حقوقك: يحق لك طلب نسخة من بياناتك أو حذف حسابك في أي وقت بالتواصل مع الدعم.',
    'Privacy Policy'
      || E'\n\n'
      || 'We respect your privacy. This policy explains how we collect, use, and protect your personal data in the Farhatukum app.'
      || E'\n\n'
      || '1. Data we collect: name, email, phone number, location (optional), and verification documents uploaded by providers.'
      || E'\n'
      || '2. How we use it: to operate booking services, enable customer–provider communication, send notifications, and verify providers.'
      || E'\n'
      || '3. Data sharing: we don''t share your data with third parties except as needed to deliver the service or as required by law.'
      || E'\n'
      || '4. Your rights: you may request a copy of your data or delete your account at any time by contacting support.'
  )
on conflict (key) do nothing;
