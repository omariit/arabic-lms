# خريطة المشروع — ابدأ من هنا (ملف المرجع الوحيد)

> **الغرض:** أي نموذج/مطوّر يبدأ على هذا المشروع يقرأ **هذا الملف فقط** (≈ ٦ آلاف توكن)
> فيفهم البنية والعقود والقواعد، بدل قراءة ١٩٤ ملفًا (~٢٥٠ ألف توكن، أي ٤٠ ضعفًا).
> كل سطر هنا مقيس من الكود، لا من الذاكرة. آخر تحديث: جولة تقليل البيانات والذاكرة.
>
> **قاعدة:** لا تفتح ملفًا إلا إذا كان اسمه في الجدول أدناه (تحتاج تغييرًا فيه فعلًا).
> للتفاصيل الطويلة: `docs/recording.md` · `docs/meetings.md` · `docs/uploads.md` · `docs/qa.md` · `docs/roadmap-100.md`.

---

## ١. ما هو المشروع في ثلاثة أسطر

منصة تعلّم عربية (RTL، mobile-first) لمعلّمة قرآن واحدة: دورات وقراءات وإتقان وإجازة بمستويات،
حصص مباشرة (يوتيوب للشرح + غرفة WebRTC للتفاعل)، استوديو تسجيل للشرح على اللوح، اختبارات
(اختيار متعدد وصوتي)، دفع يدوي (CliQ/تحويل) وتفعيل إداري، لوحة تحكم كاملة للمعلّمة/الإدارة.
العلامة: **مُقْرِئَة**. النطاق الحقيقي: مشروع Railway واحد بخطة Hobby ($5/شهر).

---

## ٢. الحزمة والبنية

| الطبقة | التقنية | الملف الجذري |
|---|---|---|
| واجهة | Next.js 15 App Router + React 19 + TypeScript + Tailwind | `src/app/`, `tailwind.config.ts` |
| خادم | `node server.js` = Next.js + Socket.io (HTTP مخصّص، منفذ `PORT`) | `server.js` (946 سطرًا) |
| قاعدة بيانات | PostgreSQL + Prisma (30 model · 12 enum · 13 migration) | `prisma/schema.prisma` |
| ملفات | Cloudflare R2 (روابط موقّعة، المتصفح يرفع مباشرة) | `src/lib/r2.ts`, `src/lib/upload-client.ts` |
| فيديو الحصص | WebRTC ندّ‑لندّ (لا يمرّ بسيرفرنا) + Socket.io للتحكم | `src/components/meeting-room.tsx`, `server.js` |
| التسجيل | خدمة مستقلة `recording-service/` (Express + FFmpeg + Volume) | `recording-service/{server,pipeline,lib}.js` |
| بث يوتيوب | YouTube Data API v3 (OAuth للمعلّمة) | `src/lib/youtube.ts` |
| إشعارات | Web Push (VAPID) + Service Worker PWA | `src/lib/push.ts`, `public/sw.js` (cache `muqriah-v6`) |

### شجرة الجذر
```
server.js              نقطة التشغيل: Next + Socket.io + إنهاء لطيف (SIGTERM)
prisma/                schema + seed.mjs (أدمن+دورة) + seed-qa.mjs (بيانات الاختبار)
recording-service/     خدمة مستقلة: استقبال chunks → FFmpeg → MP4 + thumbnail + purge
src/app/               32 صفحة + 75 مسار API
src/components/        19 مكوّنًا (أكبرها meeting-room 1360 · board-stage 448 · protected-player 363)
src/lib/               26 وحدة منطق خالصة (سهلة الاختبار)
src/hooks/             3 خطافات (use-audio-recorder · use-ice-servers)
tests/                 16 ملف vitest (104 اختبار) + tests/e2e/ 14 ملف Playwright
scripts/               أدوات تحقق/فحص (login، ux-audit، pdf-worker)
docs/                  recording · meetings · uploads · qa · roadmap-100 · TASKS · prompt
Dockerfile · railway.json   نشر Railway (builder = Dockerfile)
```

---

## ٣. الصفحات (32) — من يرى ماذا

| المسار | الدور | الوظيفة |
|---|---|---|
| `/` | عام | صفحة تسويقية من CMS (`SiteContent`)؛ المسجّل يُحوَّل إلى `homeFor(role)` (`?preview=1` للموظفين) |
| `/courses`, `/courses/[id]` | عام | قائمة الدورات + صفحة دورة + طلب تسجيل (CliQ) + سعر حسب البلد |
| `/login`, `/register` | عام | **تعمل بلا JavaScript** (نموذج POST أصلي) |
| `/dashboard`, `/dashboard/chat` | STUDENT | دوراتي، دروسي، محادثة مع المعلّمة |
| `/lesson/[id]` | STUDENT | فيديو محمي + وصف/سكربت/واجب + خيط خاص بالطالبة (نص/صوت) |
| `/exam/[id]` | STUDENT | محاولة MCQ (ترتيب مخلوط لكل محاولة) أو اختبار صوتي |
| `/live/[id]` | STUDENT/ضيف | غرفة الحصة (ندّ‑لندّ) أو مشغّل يوتيوب؛ الضيف عبر `?invite=` |
| `/admin` | ADMIN/TEACHER | لوحة رئيسية: أرقام، بريد الواجبات، وصول سريع |
| `/admin/courses`, `/admin/courses/[id]` | موظفون | الدورات + باني الدورة (وحدات/دروس/مصادر) |
| `/admin/lessons/[id]` | موظفون | صندوق الدرس: خيوط الطالبات + تصحيح صوتي |
| `/admin/exams`, `/admin/exams/[id]`, `/admin/grading` | موظفون | باني الاختبارات، بنك الأسئلة، تصحيح الصوت |
| `/admin/enrollments`, `/admin/vouchers`, `/admin/students`, `/admin/staff` | ADMIN | تفعيل الاشتراكات، القسائم، الطالبات، الموظفون |
| `/admin/live`, `/admin/live/[id]/report` | موظفون | بدء حصة + تقرير (أسئلة + حضور) |
| `/admin/studio`, `/admin/recordings` | TEACHER/ADMIN | الاستوديو (لوح + تسجيل) وإدارة التسجيلات |
| `/admin/landing`, `/admin/testimonials`, `/admin/profile` | ADMIN (وبروفايل للمعلّمة) | محتوى الصفحة الرئيسية، آراء الطالبات، بيانات المعلّمة |
| `/admin/inbox`, `/admin/chat`, `/admin/violations` | موظفون | بريد الواجبات، المحادثات، سجل المخالفات |
| `/offline`, `not-found.tsx`, `error.tsx` | عام | صفحات PWA/أخطاء عربية |

**قاعدة:** كل ميزة في مكان واحد فقط، وشريط تنقّل واحد لكل دور (`staff-nav.tsx` للموبايل: ٤ + «☰ المزيد»، `student-nav.tsx`).

---

## ٤. مسارات API (75) — التجميع

`/api/auth/*` (login, login-form, logout, register, session) · `/api/admin/*` (لكل كيان CRUD + `inbox`, `recordings/[id]/{finalize,abort,attach}`, `recordings/purge`, `live/[id]/report`) ·
`/api/lessons/*`, `/api/exams/*`, `/api/live/*`, `/api/chat/*`, `/api/student/*` (enroll-request، voucher) ·
`/api/r2/{upload,audio}` · `/api/recordings/[id]/{video,thumbnail}` · `/api/video/{token,play}` ·
`/api/webrtc/ice` · `/api/push` · `/api/health` · `/api/internal/recordings/callback` (من الخدمة إلينا).

**نمط كل مسار محمي:** `const u = await apiUser("ADMIN" | "TEACHER" | "STAFF" | "STUDENT" | "any")`
→ إن فشل يعيد `NextResponse.json({error:"غير مصرح"}, {status: …})`. كل إعادة توجيه تستخدم `publicUrl(req, path)`
(لأن بروكسي Railway يجعل `req.url` = `http://localhost:PORT`).

---

## ٥. نموذج البيانات — الأسر العائلية

| المجموعة | النماذج | ملاحظات حرجة |
|---|---|---|
| هوية | `User` (ADMIN/TEACHER/STUDENT/ASSISTANT) · `Session` · `SecurityViolation` · `PushSubscription` | الجوال E.164 فريد؛ الجلسة مرتبطة ببصمة جهاز + IP |
| محتوى | `Course` · `CoursePrice` · `Module` · `Lesson` · `LessonResource` | `CoursePrice` تجاوز سعري لكل بلد؛ الافتراضي ٣٠ د.أ |
| تفاعل درس | `LessonThread` · `LessonMessage` | `@@unique([lessonId, studentId])` — خيط واحد لكل (درس، طالبة) |
| تسجيل | `Enrollment` · `EnrollmentRequest` · `Voucher` | الاشتراك هو مصدر الحقيقة للوصول |
| اختبارات | `Exam` · `Question` · `ExamAttempt` · `AudioSubmission` | `questionOrder` يُثبَّت لكل محاولة |
| حصص | `LiveSession` · `LiveMessage` · `AttendanceLog` · `LivePoll` · `LivePollAnswer` | الحضور من `AttendanceLog` لا من الذاكرة |
| تسجيلات | `RecordingSession` (+ حجم/مدة/thumbnail) | تسجيل واحد لكل درس (409 للتكرار) |
| متجر/محتوى | `SiteContent` · `Testimonial` · `TeacherProfile` · `TeacherOAuthToken` | الصفحة الرئيسية تُحرَّر بالكامل من `/admin/landing` |
| محادثة | `Conversation` · `Message` | ASSISTANT يرى المحادثات فقط |

---

## ٦. المصادقة — البوابة واحدة

- الكوكي `lms_session` = `payload.signature` (HMAC‑SHA256 بـ`AUTH_SECRET`)، HTTP-only.
- `src/middleware.ts` (Edge): يتحقق من **شكل** التوكن فقط، ولا يرى قاعدة البيانات.
  - يحمي `/admin`, `/dashboard`, `/lesson`, `/exam`, `/live`, `/api/admin`.
  - **لا يعيد توجيه `/login` أبدًا** (كان يسبب `ERR_TOO_MANY_REDIRECTS`)، ويحذف الكوكي الميت.
  - `/live/[id]?invite=` يُسمح به بلا جلسة (الصفحة + مصافحة Socket تتحققان).
- `getCurrentUser()` في `src/lib/auth.ts` هو الحكم النهائي (جلسة حيّة + بصمة جهاز؛ عدم التطابق يُشفى ويُسجَّل).
- الدخول من بابين ونداء واحد: `POST /api/auth/login` (JSON) و`POST /api/auth/login-form` (POST أصلي، 303)
  كلاهما `attemptLogin()` في `src/lib/auth-login.ts`، والرسائل في `src/lib/login-messages.ts`.
- **محدِّد المحاولات يعدّ الفشل فقط** (`login-fail:<ip>:<آخر٩>` ٨/دقيقة + سقف `login-ip-fail:<ip>` ٦٠/دقيقة)، ويُصفَّر عند النجاح.
- التطبيع: `src/lib/login-input.ts` — أرقام عربية-هندية، شرطات ذكية، `00962`/`+962`، حذف الصفر الأول.

---

## ٧. الخطوط الوظيفية (أين يبدأ كل تدفق)

| التدفق | نقطة البداية | الملفات التي تلمسها عادة |
|---|---|---|
| تسجيل جديد → طلب اشتراك → تفعيل | `src/app/courses/[id]/enroll-actions.tsx` → `/api/student/enroll-request` | `admin/enrollments/*`, `api/admin/enrollments`, `src/lib/pricing.ts` |
| مشاهدة درس | `src/app/lesson/[id]/page.tsx` | `lesson-workspace.tsx`, `protected-player.tsx`, `api/video/{token,play}` |
| واجب/خيط درس (نص+صوت) | `lesson-workspace.tsx` | `voice-note.tsx`, `api/lessons/[id]/{thread,audio}`, `admin/lessons/[id]/lesson-inbox.tsx` |
| اختبار MCQ/صوتي | `src/app/exam/[id]/page.tsx` | `exam-runner.tsx`, `voice-exam.tsx`, `src/lib/exam-order.ts`, `api/exams/*` |
| حصة يوتيوب (أحادي) | `admin/one-click-launcher.tsx` | `src/lib/youtube.ts`, `api/live/start`, `live-room.tsx` |
| حصة تفاعلية (غرفة) | `admin/live/page.tsx` → `/live/[id]` | `meeting-room.tsx`, `server.js` (namespace `/meet`) |
| استوديو + تسجيل | `admin/studio/studio.tsx` | `board-stage.tsx`, `src/lib/board-pages.ts`, `src/lib/recording.ts`, `recording-service/*` |
| مشاهدة تسجيل | `components/recorded-video.tsx` | `api/recordings/[id]/{video,thumbnail}`, `src/lib/recording-access.ts` |
| محادثة طالبة↔موظف | `dashboard/chat/chat-client.tsx` | `api/chat/*`, `admin/chat/*` |

---

## ٨. الغرفة المباشرة (`server.js` + `meeting-room.tsx`)

Namespace `/meet`. الأحداث: `meet:join|knock|admitted|roster|signal|media|chat|hand|control|spotlight|granted|kicked|forced|ended|host-left|waiting` +
`meet:poll-create|poll-answer|poll-close|attendance` → بث `meet:poll|poll-counts|poll-ack|poll-closed|poll-progress`.

- **ثلاثة مسارات لكل ندّ:** صوت + كاميرا + شاشة (٣ transceivers/ندّ، تُبدَّل بـ`replaceTrack`).
- **اختيار مصدر الفيديو من roster لا من الـtrack**: `pickVideoStream(streams, preferScreen)` في `src/lib/rtc-media.ts`.
  (كروم يبلّغ عن مسار مُتفاوض صامت على أنه غير مكتوم.) `screenOn` من الـroster هو الحقيقة.
- **سقوف الإرسال** في `src/lib/rtc-send.ts`: صوت ٢٤k · كاميرا ٣٢٠k @640×360/20fps · شاشة ٩٠٠k @10–15fps،
  مع `contentHint` (`speech`/`motion`/`detail`) و`degradationPreference`، وتُطبَّق بعد كل `replaceTrack` وبعد التفاوض.
- `<video>` **دائمًا muted** + `play()` عند `loadeddata` (شرط التشغيل التلقائي على الجوال/iOS).
- الجودة: `src/lib/rtc-stats.ts` → لوحة «📶 جودة الاتصال» (kbps، rtt، فقد، دقة، مرشّح، **MB ذهابًا/إيابًا**).
- إنهاء الحصة: `leave-room` → `meet:control {action:"end-lecture"}` → `endLecture()` (status ENDED، إغلاق الأسئلة، ختم `leftAt`، فصل السوكيتات). الانقطاع المفاجئ له سماح ٣٠ ثانية.
- الأسئلة (polls): الحقيقة على الخادم؛ `pollPayload()` يحجب الإجابة الصحيحة حتى الإغلاق؛ إجابة واحدة لكل طالبة.
- TURN: `/api/webrtc/ice` يمنح بيانات قصيرة العمر؛ **لا يوجد خادم coturn** ⇒ السقوط على STUN (`hasRelay:false`).

---

## ٩. الاستوديو والتسجيل

- اللوح = مصدر الفيديو (`canvas.captureStream(15)`)، والأدوات في DOM **خارج** اللوحة ⇒ لا يمكن أن تُسجَّل.
- الصفحات: `src/lib/board-pages.ts` تُحلَّل **كلها في المتصفح** (PDF/صور/DOCX/PPTX) وتُخزَّن **صورًا مضغوطة WebP/JPEG**
  مع فكّ ترميز ٣ صفحات كحد أقصى (LRU) — لا تُرفع أي ملفات.
- مقاسات التسجيل: استوديو ٩٠٠kbps/٤٨kbps، حصة مباشرة ٧٠٠kbps/٤٨kbps.
- التطبيق **لا يلمس بايتات الفيديو**: المتصفح يرفع chunks إلى الخدمة، والخدمة تُنتج MP4 + thumbnail على Volume.
- الخدمة: `POST /sessions` → `PUT /sessions/:id/chunks/:i` → `POST /finalize` → `GET /video.mp4` (**307** مع توكن عرض ٣٠ دقيقة) · `POST /maintenance/purge {keep:[…]}`.
- خط المعالجة (`pipeline.js`): إن كانت القطع H.264 ⇒ **نسخ ودمج** (`-c copy`) مع تحقق مدة ±٣٪، وإلا ترميز رخيص
  (`ultrafast`, `crf 30`, ‎≤1280/20fps`) ثم دمج نسخ. مقيس: ٣٥ ثانية ⇒ جاهز في **٩٠٣ms**.
- الصلاحية: `recording-access.ts` — مسجَّلة فقط؛ المجهول 401 وغير المسجّلة 403؛ ASSISTANT 403.

---

## ١٠. ثوابت لا تُكسَر (كل واحدة منها كانت خللًا حقيقيًا)

1. **لا تُحوِّل `/login` من middleware**؛ القرار في الصفحة بعد قراءة قاعدة البيانات.
2. `/login` و`/register` يجب أن يعملا **بصفر JavaScript**، والكلمة لا تمرّ في URL أبدًا.
3. Service Worker لا يخزّن صفحات خاصة **ولا `/login`/`/register`**.
4. كل طلب عميل يفشل ⇒ رسالة عربية + زر إعادة، و401 غير متوقّع ⇒ `/login?expired=1`. لا شاشة انهيار خام.
5. شاشات الإدارة تُحمّل بياناتها تلقائيًا (لا «اضغط للعرض»).
6. حدود الأسئلة/الحضور على الخادم لا في الواجهة.
7. خصوصية الطالبة: خيطها وواجبها وتقريرها فقط؛ التسجيل 403 لغير المشتركة.
8. اختيار فيديو الحصة من `roster.screenOn`؛ والفيديو muted دائمًا.
9. رفع الملفات: presign → المتصفح PUT → الخادم يتحقق بـ`verifyUpload()`؛ المفتاح مربوط بالمالك (`keyBelongsTo`).
10. الملفات في اللوح تُحلَّل محليًا؛ لا تُرفع.
11. تسجيل واحد لكل درس (409)، وحذف تسجيل ⇒ استدعِ `POST /api/admin/recordings/purge` لتحرير بايتات الـVolume.
12. اختبارات E2E **مستقلة عن الترتيب**: كل ملف ينشئ ما يحتاجه.
13. QA على **staging فقط**؛ على الإنتاج تُشغَّل `06-smoke.spec.ts` وحدها (قراءة فقط).
14. `DATABASE_URL` يحتاج `?connection_limit=5&pool_timeout=20&connect_timeout=15` (بدونه ظهر «صار خلل مؤقت» تحت الحمل).

---

## ١١. الأوامر (نسخ ولصق)

```bash
npm run dev                 # node server.js (Next + Socket.io)
npm run build               # prisma generate && next build  (prebuild ينسخ pdf.worker)
npx vitest run              # 104 اختبار وحدة / 16 ملف
node scripts/map-facts.mjs  # حقائق مقيسة (صفحات/مسارات/نماذج/أحداث…) لتحديث هذه الخريطة
node scripts/map-facts.mjs --check   # يفشل إن كانت أرقام الخريطة لا تطابق الكود
node scripts/install-prompts.mjs     # يثبّت docs/prompts/*.md كأوامر: /master و /project-map
node scripts/ux-audit.mjs   # فحص ٣٢ شاشة (موبايل) — يجب أن يعطي 0 findings
node scripts/check-login-nojs.mjs ; node scripts/check-login-loop.mjs
QA_SEED=1 node prisma/seed-qa.mjs                              # بيانات الاختبار (staging)
QA_BASE_URL=https://arabic-lms-staging.up.railway.app npx playwright test
QA_BASE_URL=https://arabic-lms-production.up.railway.app QA_SMOKE=1 npx playwright test tests/e2e/06-smoke.spec.ts
```

**النشر (Railway):**
```bash
npx next build  -> grep "✓ Generating static pages"
railway up -e staging|production -s arabic-lms --detach          # التطبيق
railway up ./recording-service --path-as-root -e <env> -s recording-service --detach
# انتظر ~٢٥٠ ثانية ثم: curl -s -o /dev/null -w "%{http_code}" <URL>/api/health   (يجب 200)
```

**هجرات قاعدة البيانات:** `npx prisma migrate deploy` (من جهازك مع `DATABASE_URL` للإنتاج؛ `railway run` لا يعمل).

---

## ١٢. البيئة والبنية التحتية

| المتغير | الاستخدام |
|---|---|
| `DATABASE_URL` | Postgres (Railway) — مع بارامترات المسبح أعلاه |
| `AUTH_SECRET` | توقيع الجلسة (٦٤ hex) |
| `R2_ACCOUNT_ID` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_BUCKET_NAME` (`muqriaa`) | الملفات |
| `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `NEXT_PUBLIC_APP_URL` | OAuth يوتيوب (**غير مضبوط بعد**) |
| `RECORDING_SERVICE_URL` `NEXT_PUBLIC_RECORDING_SERVICE_URL` `RECORDING_SHARED_SECRET` | خدمة التسجيل |

- **إنتاج:** `https://arabic-lms-production.up.railway.app` · خدمة التسجيل `https://recording-service-production-1c73df77.up.railway.app`
- **staging:** `https://arabic-lms-staging.up.railway.app` · `https://recording-service-staging.up.railway.app`
- مشروع Railway `6f7d787d-cfd7-4e05-9766-efedc67ee4eb` · التطبيق `06d2c22c-1f56-448f-b2e5-21935d510314` · خدمة التسجيل `558121b9-fb89-45de-bcc7-c6c27ce7ef22`
- بيئة الإنتاج `fcc7407a-f67d-4973-89d6-d59c4056b9a7` · staging `055e377c-5c00-4a5e-9c05-41201356e5b1`
- Volumes: `postgres-volume` (~179MB إنتاج / 222MB staging) · `recording-service-volume(-KUDh)` (~85MB إنتاج / 0 staging) من 5000MB.
- **الأسرار وكلمات المرور لا تُكتب في المستودع** (المستودع عام). حسابات الدخول المعروفة: إدارة `0787262186`، معلّمة `0785054355` — الكلمات عند المالك.
- حسابات الاختبار على staging: `+962790000001..6` (كلمة المرور في `tests/e2e/.qa-state.json` وتُولَّد من seed).

---

## ١٣. الاختبارات — ما يغطيه كل ملف

| ملف | يغطي |
|---|---|
| `tests/e2e/01-public.spec.ts` | الصفحة الرئيسية، الدورات، SEO/روابط عامة |
| `02-auth` | تسجيل/دخول/خروج/جلسة/توجيه حسب الدور |
| `03-student` | لوحة الطالبة، درس، خيط + صوت، واجب، اختبار |
| `04-teacher` | تحكم المعلّمة، طلبات الاشتراك، مساعد، اجتماعات أسبوعية |
| `05-meeting` | غرفة الحصة: ضيف، إدارة، إنهاء |
| `06-smoke` | فحص إنتاجي **للقراءة فقط** (يجب `QA_SMOKE=1`) |
| `07-studio` | استوديو ⇒ MP4 قابل للتشغيل |
| `08-wiring` | ترابط: صندوق الواجبات، خلط الاختبار |
| `09-studio-board` | لوح: كل أداة تُسجَّل، الأدوات لا تظهر |
| `10-admin-crud` | إنشاء/تعديل كيانات الإدارة |
| `11-student-journey` | رحلة طالبة كاملة |
| `12-live-poll` | أسئلة الحصة + تقرير الحضور |
| `13-meeting-video` | فيديو في الاتجاهين (≥٢ بلاطات لكل جهة) + إنهاء الحصة |
| `14-homework-voice` | ميكروفون الواجب + سماع المعلمة |
| `tests/*.test.ts` | ١٠٤ اختبارات وحدة: auth، phone، pricing، crypto، exam-order، polls، rtc-media/stats/send، recording، rate-limit، youtube، uploads |

---

## ١٤. وصفات جاهزة (أقل عدد ملفات)

**إضافة حقل/جدول:** `prisma/schema.prisma` → `npx prisma migrate dev --name …` → `npx prisma generate` → استخدمه في المسار/الصفحة → `npx tsc --noEmit` → `npx vitest run`.
**إضافة صفحة إدارة:** `src/app/admin/<name>/page.tsx` (Server Component: `await requireStaff()` ثم عنوان + المكوّن العميل) + `<name>-client.tsx` («use client»: يُجلب كل شيء عبر `fetch("/api/admin/…", {cache:"no-store"})` داخل `useEffect` مع حالة تحميل/خطأ + زر إعادة) + مسار API تحت `src/app/api/admin/<name>/route.ts` + رابط في `staff-nav.tsx`. لا حاجة لـ`force-dynamic` (قراءة الكوكي/الـheaders تجعل الصفحة ديناميكية). **كل عنصر مهم يحتاج `data-testid`** لأن اختبارات Playwright تعتمد عليه.
**إضافة حدث Socket:** `server.js` (بجوار `meet:chat`) + بث للغرفة + معالجة في `meeting-room.tsx` + تحديث `docs/meetings.md`.
**إضافة نوع ملف إلى R2:** أضِف صنفًا في `UPLOAD_KINDS` داخل `src/lib/r2.ts` **و** في `src/lib/upload-client.ts` (البادئة + المالك)، ثم استخدم `uploadToR2(file, kind, ownerId)`.
**تعديل نص الصفحة الرئيسية:** لا تلمس الكود — من `/admin/landing` (يُخزَّن في `SiteContent`، و`DEFAULT_SECTIONS` في `src/lib/site-content.ts` للافتراضي).
**تغيير السعر:** من `/admin/courses/[id]` (تجاوز لكل بلد في `CoursePrice`)؛ الافتراضي في `src/lib/pricing.ts`.

---

## ١٥. التكاليف المقيسة (لتفادي قرارات خاطئة)

| البند | القيمة | التفسير |
|---|---|---|
| حجم قاعدة البيانات المنطقي | ~10.2 MB | الـVolume 179MB = بيانات + WAL/كتالوج/مؤقت (~١٧×، طبيعي) |
| Egress | 1.78 GB/شهر | ≈٦٠ ألف صفحة، أو ١٠–١٥ تشغيلًا كاملًا لتسجيل ٣٠ دقيقة |
| CPU بالذاكرة | 1026 GB‑min | ≈٢٤ MB متوسط ⇒ الخدمات نائمة؛ الإجمالي ≈ $0.37 داخل خطة $5 |
| الحصص المباشرة | egress ≈ 0 | WebRTC بين المتصفحين؛ الخادم يوقّع فقط |
| بيانات الطالبة | ~١٥١ MB/ساعة (بعد السقوف) | كانت ~٤٤٣ MB |

**قرار مؤجَّل يستحق التنفيذ:** نقل MP4 الجاهز إلى **R2** (خروج مجاني) ⇒ يلغي بند خروج الفيديو، ويسمح بحذف Volume التسجيلات.

---

## ١٦. المعلَّق والمحجوب

| البند | الحالة |
|---|---|
| خادم TURN (coturn) | الكود والبيانات جاهزة؛ لا يوجد خادم ⇒ شبكات مقيّدة قد تفشل |
| OAuth يوتيوب | يحتاج `GOOGLE_CLIENT_ID/SECRET` من المالك |
| بروفايل المعلّمة على الإنتاج | فارغ (CliQ/بنك/واتساب) ⇒ صفحة الدفع بلا وجهة |
| تعريب الشاشات الداخلية للإنجليزية | قرار منتج يحتاج مترجمًا بشريًا |
| إعادة مفتاح R2 (ظهر في محادثة سابقة) | يجب تدويره |

---

## ١٧. أسلوب العمل (ملزم)

- **Superpowers**: `.agents/skills/` (١٥ مهارة). قبل أي عمل: `using-superpowers` → المهارة المناسبة
  (ميزة: `brainstorming` · خلل: `systematic-debugging` · كود: `test-driven-development` · ادعاء الإنجاز: `verification-before-completion`).
- **قبل قول «تمّ»**: دليل مقيس (اختبار أخضر/استجابة 200/سجل)، لا انطباع.
- **أي تعديل واجهة**: `npx tsc --noEmit` + `npx vitest run` + إن لمس الحصص/الاستوديو شغّل الـspec المعني على staging.
- **العربية أولًا** في كل نص جديد (والترجمة في `src/lib/i18n.ts` عبر مفاتيح `dict(locale)`).
- مهارات المشروع الخاصة: `lms-recording-pipeline` · `lms-railway-deploy` · `lms-qa-playwright`.
- **برومبتات جاهزة** في `docs/prompts/`: `master.md` (أي مهمة: بناء/تطوير/إصلاح/تحليل) و`project-map.md`
  (تحديث هذه الخريطة). ثبّتها كأوامر بـ`node scripts/install-prompts.mjs` ثم `/reload` ⇒ `/master …` و`/project-map`.
  الخريطة تُدقَّق آليًا: `node scripts/map-facts.mjs --check`.
