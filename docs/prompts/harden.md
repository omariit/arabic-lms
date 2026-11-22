---
description: جولة تحصين المشروع — بند واحد في كل مرة، بدليل مقيس قبل/بعد
argument-hint: "[معرّف البند H1..H12 | all | التالي]"
---
طبقًا لـ`docs/PROJECT-MAP.md` (اقرأه أولًا ولا تقرأ غيره إلا ما تلمسه).

المطلوب في هذه الجولة: **${@:-التالي بالترتيب من قائمة H1..H12 أدناه}**

## القائمة المرتّبة (كل بند نُفِّذ يجب أن يمرّ اختبار قبول مكتوب معه)

**H1 — نسخ احتياطي حقيقي لقاعدة البيانات.** لا توجد اليوم أي سياسة نسخ في المستودع.
أنشئ `scripts/db-backup.mjs` يفعل `pg_dump --format=custom` إلى ملف مضغوط، ويرفع إلى R2 تحت
`backups/<date>.dump`، ويحذف ما تجاوز ١٤ يومًا. اختبر **الاستعادة** على قاعدة staging جديدة
(`pg_restore` ثم `prisma migrate status` ثم `/api/health`). سجّل الأمر في `docs/PROJECT-MAP.md` قسم الأوامر.

**H2 — مراقبة الأخطاء والتنبيه.** اليوم تُكتشف الأعطال من المستخدمة. أضف مراقبة خارجية
(UptimeRobot أو cron على GitHub Actions كل ٥ دقائق يطلب `/api/health` ويفحص `/login` و`/api/auth/session`)
مع تنبيه إلى بريد/واتساب المالك، وقاعدة: أي 5xx يُسجّل بـ`[error]` مع المسار والمعرّف.

**H3 — تسديد ثغرات الحزم.** `npm audit` يعطي ٥ high (deepmerge-ts · effect · postcss تحت next) و٥ moderate (uuid).
شغّل `npm audit fix` (بلا `--force`)، ثم `npx tsc --noEmit` + `npx vitest run` + build، وإن بقي ما يحتاج `--force`
أضف `overrides` في `package.json`. أرفق مخرجات `npm audit --omit=dev` قبل/بعد.

**H4 — ترويسة HSTS.** الموجود: nosniff · XFO · Referrer-Policy · Permissions-Policy. أضف
`Strict-Transport-Security: max-age=31536000; includeSubDomains` على الإنتاج فقط، وتحقّق بـ`curl -I`.

**H5 — بوابة جودة في CI.** لا ESLint ولا GitHub Actions، والبناء يتجاهل lint
(`eslint.ignoreDuringBuilds: true`). أضف `eslint.config.mjs` (next/core-web-vitals) و`npm run lint`،
ووركفل `ci.yml` يشغّل: `tsc --noEmit` · `vitest run` · `next build` · `node scripts/map-facts.mjs --check`.
أصلح ما يظهر من أخطاء حرجة فقط (لا تُعِد تنسيق المشروع).

**H6 — مهام مجدولة للنظافة.** لا cron. أضف `/api/internal/jobs` محميًا بسرّ، ويعمل:
حذف `Session` المنتهية · تعليم `RecordingSession` العالقة FAILED بعد ساعة · استدعاء
`purgeOrphanRecordings` · إنهاء `Enrollment` المنتهية · تعليم `Voucher` المنتهية. جدوله عبر GitHub Actions كل ساعة.

**H7 — اختبارات عقود API.** صفر مسار مذكور في الاختبارات (كلها عبر الواجهة). أضف
`tests/api-contract.test.ts` يغطي: 401 للمجهول على ٦ مسارات محمية · 403 للدور الخاطئ ·
`recordings/[id]/video` = 307 مع توكن، 403 لغير المشتركة · `login-form` يعيد 303.
اختبر على staging فقط.

**H8 — أداء الصور والـLCP.** `images.unoptimized: true` و١٤ `<img>` بلا `next/image`.
قِس LCP للصفحة الرئيسية على 3G مُحاكى، ثم استخدم `next/image` أو `fetchPriority="high"` +
أبعاد صريحة للصور فوق الطية، وأعد القياس وأظهر الفرق بالكيلوبايت.

**H9 — إتاحة (a11y).** ١٩ سمة `aria` في التطبيق كله. ابدأ بأعلى ٣ شاشات استخدامًا:
`aria-label` لكل زر أيقوني في `meeting-room` و`board-stage` و`staff-nav`، `aria-live` لحالة
الاتصال والتسجيل، وتركيز مرئي. اختبر بلوحة المفاتيح فقط وسجّل ما نجح.

**H10 — بروفايل المعلّمة على الإنتاج.** فارغ ⇒ صفحة الدفع بلا وجهة. املأه من `/admin/profile`
أو اكتب تحذيرًا في لوحة الإدارة إن بقي فارغًا (`CliQ`/بنك/واتساب) مع رابط مباشر للإكمال.

**H11 — MP4 على R2.** التسجيلات تُخدَم من Volume. انقل الملف الجاهز إلى R2 عند `finalize`
وخدّمه بتوقيع مؤقت (نفس نمط `presignGet`)، واحتفظ بالـVolume كاحتياط فقط. أعد قياس الخروج.

**H12 — تصدير تقرير الحصة/التقدّم.** التقرير شاشة فقط. أضف تصدير CSV (حضور + إجابات) من
`admin/live/[id]/report` وتصدير تقدّم الطالبة من `/admin/students`.

## طريقة العمل (إلزامية)
1. **قِس الحالة الآن** قبل التغيير (أمر/رقم/مخرج) واكتبه.
2. غيّر **بندًا واحدًا** فقط، بأقل عدد ملفات.
3. تحقق: `npx tsc --noEmit` ← `npx vitest run` ← اختبار البند على **staging** ← (إن نشرت) `curl /api/health` = 200.
4. سجّل القبول: «قبل ← بعد» بالأرقام.
5. حدّث `docs/PROJECT-MAP.md` في نفس الكوميت إن تغيّرت البنية (ملف/أمر/ثابت جديد).

## التسليم
- البند المُنفَّذ + الملفات الملموسة.
- الدليل المقيس (قبل/بعد) ومخرج اختبار القبول.
- المخاطر وما تأجّل ولماذا.
- البند التالي المقترح.

## توقّف واطلب قراري إن
لمست بيانات إنتاج (restore/حذف)، أو احتجت حسابًا/سرًّا (Sentry · UptimeRobot · بريد)،
أو كان البند سيعطّل ميزة قائمة. غير ذلك نفّذ حتى النهاية.
