# تسجيل الحصص — استوديو التعليم + خدمة التسجيل

المعلّمة تفتح **/admin/studio**، تضغط «ابدئي التسجيل»، تُشارك الشاشة أو الكاميرا، ثم تضغط
«إنهاء الحصة واستخراج الفيديو». النتيجة: ملف **MP4** جاهز للمشاهدة والتنزيل، مربوط اختياريًا
بدرس، ويظهر للطالبات داخل صفحة الدرس بمشغّل محمي.

التسجيل **لا يمرّ عبر سيرفر التطبيق**: المتصفح يرفع مقاطع صغيرة (WebM كل 4 ثوانٍ) مباشرة إلى
خدمة منفصلة (`recording-service`) على Railway، والخدمة تدمجها بـ FFmpeg وتنتج MP4 + صورة مصغرة.
هذا يعني:

- إغلاق المتصفح أو انقطاع الشبكة لا يفقد الحصة كلها — المقاطع المرفوعة محفوظة على قرص دائم.
- سيرفر التطبيق لا يستهلك ذاكرة/باندويث على الفيديو، فلا يتأثر بخطة Railway الصغيرة.
- الفيديو الأصلي يمكن استخراجه لاحقًا من صفحة **/admin/recordings** حتى لو أُغلقت الصفحة.

```
متصفح المعلمة ──PUT chunk-000001.bin──▶ recording-service (Node + FFmpeg، Volume 5GB)
      │                                        │
      │◀──── MP4 عبر 307 redirect + توكن ──────┘
      │
      └──POST /api/admin/recordings/{id}/finalize──▶ سيرفر التطبيق ──▶ DB (RecordingSession)
```

## المكوّنات

| المكوّن | الملف | الوظيفة |
|---|---|---|
| صفحة التسجيل | `src/app/admin/studio/studio.tsx` | MediaRecorder + طابور رفع مع إعادة محاولة + استعادة جلسة |
| صفحة التسجيلات | `src/app/admin/recordings/` | الحالة، المدة، الحجم، مشاهدة، نسخ الرابط، حذف |
| مشغّل محمي | `src/components/recorded-video.tsx` | مشغّل للطالبات مع علامة مائية |
| عميل الخدمة | `src/lib/recording.ts` | إنشاء جلسة، توكنات، finalize، مزامنة الحالة |
| قاعدة الوصول | `src/lib/recording-access.ts` | من يحق له المشاهدة (دالة نقية + اختبارات) |
| الخدمة | `recording-service/server.js` | HTTP API + حجم القرص + تنظيف دوري + callback |
| خط المعالجة | `recording-service/pipeline.js` | دمج المقاطع، FFmpeg، thumbnail، فحص المدة |
| أدوات مشتركة | `recording-service/lib.js` | توكنات HMAC، إطارات المقاطع، ضغط القرص |

## متغيّرات البيئة

على **خدمة التطبيق** (`arabic-lms`):

```env
RECORDING_SERVICE_URL=https://recording-service-production-xxxx.up.railway.app
NEXT_PUBLIC_RECORDING_SERVICE_URL=https://recording-service-production-xxxx.up.railway.app
RECORDING_SHARED_SECRET=<32 حرفًا عشوائيًا — نفس القيمة في الخدمة>
```

على **خدمة التسجيل** (`recording-service`):

```env
RECORDING_SHARED_SECRET=<نفس السر>
DATA_DIR=/data/recordings              # يجب أن يطابق مسار الـ Volume
CORE_BE_CALLBACK_URL=https://<التطبيق>/api/internal/recordings/callback
RECORDING_CALLBACK_SECRET=<نفس السر>   # يُستخدم لتوقيع الـ callback
CHUNK_MAX_AGE_HOURS=24
TEMP_MAX_AGE_HOURS=12
STALE_SESSION_MAX_AGE_HOURS=24
DISK_HIGH_WATER_MARK=80
DISK_CRITICAL_MARK=90
```

`NEXT_PUBLIC_*` تُحقن في حزمة المتصفح وقت البناء، لذلك هي **مُعرَّفة كـ ARG في `Dockerfile`**؛
وبالإضافة إلى ذلك تُمرَّر `RECORDING_SERVICE_URL` من السيرفر إلى مكوّن الاستوديو كخاصية،
فالتسجيل يعمل حتى لو لم يصل متغيّر البناء.

## Railway (الإعداد مرة واحدة)

1. أنشئي الخدمة: `railway add --service recording-service` (تظهر في كل البيئات).
2. اربطي **Volume** بمسار `/data/recordings` لكل بيئة (واجهة Railway → Volume → Mount).
   - لا تكتبي `VOLUME` في الـ Dockerfile: Railway يرفضها (`dockerfile invalid: docker VOLUME ...`).
3. اضبطي المتغيّرات أعلاه لكل بيئة (staging/production منفصلتان، ولكل منهما سرّها).
4. انشري: `railway up ./recording-service --path-as-root -s recording-service -e <env> --detach`.
5. أنشئي دومين: `railway domain -s recording-service -e <env>` ثم ضعي الرابط في متغيّرات التطبيق.
6. تأكدي: `curl https://<service>/health` → `{"ok":true,...}` و`disk.totalBytes` بحجم الـ Volume.

## واجهة الخدمة (HTTP)

| المسار | من يستدعيها | الوصف |
|---|---|---|
| `GET /health` | Railway + المراقبة | الحالة، نسخة، نسبة القرص، عدد الجلسات |
| `POST /sessions` | التطبيق (سر) | إنشاء جلسة، يرجع `uploadToken` |
| `PUT /sessions/:id/chunks/:index` | المتصفح (توكن) | رفع مقطع (idempotent، نفس الفهرس آمن) |
| `POST /sessions/:id/finalize` | التطبيق | بدء الدمج والتحويل (202) |
| `POST /sessions/:id/abort` | التطبيق | إلغاء وتنظيف |
| `GET /sessions/:id` | التطبيق | صحة الجلسة (الحالة/التقدّم/المقاطع المفقودة) |
| `POST /tokens/:id` | التطبيق | توكن مؤقت للمشاهدة |
| `GET /sessions/:id/video.mp4` | المتصفح (توكن) | الملف النهائي مع دعم `Range` |
| `GET /sessions/:id/thumbnail.jpg` | المتصفح (توكن) | صورة مصغّرة |
| `DELETE /sessions/:id` | التطبيق | حذف الجلسة ومخرجاتها |

## دورة حياة الجلسة

```
RECORDING ──(أول مقطع)──▶ UPLOADING ──(finalize)──▶ PROCESSING ──▶ READY
     │                        │                          │
     └──── abort ─────────────┴──────── خطأ ─────────────┴──▶ FAILED
```

- التقدّم يُحفظ في `state.json` لكل جلسة، والحالة تُزامَن مع قاعدة البيانات بأربع طرق:
  استطلاع الصفحة، `finalize`، صفحة `/admin/recordings`، و **callback** من الخدمة إلى التطبيق
  (يعمل حتى لو أغلقت المعلمة المتصفح، ويُرسل Web Push عند الجهوزية).
- عند الفشل (مثلًا مقاطع ناقصة) تُعرض رسالة عربية واضحة، ويمكن إعادة `finalize` دون إعادة التسجيل.
- بعد الجهوزية تُحذف المقاطع الخام ويُحتفظ بـ `final.mp4` + `thumbnail.jpg`.

## الأمان والصلاحيات

- **من يسجّل**: TEACHER و ADMIN فقط (ASSISTANT ممنوع — 403).
- **من يشاهد**: صاحبة التسجيل، أي ADMIN، والطالبة إن كان اشتراكها `ACTIVE` في الدورة، أو الدرس
  `FREE_PREVIEW`. غير المسجّلة تحصل على 403، والزائر غير المسجّل على 401 (مغطّى بـ
  `tests/recording-access.test.ts`).
- التطبيق لا يمرّر بايتات الفيديو: يتحقق من الصلاحية ثم يعيد **307** إلى رابط الخدمة مع توكن
  مؤقت (30 دقيقة للمشاهدة، 60 ثانية عند الإنشاء). لذلك لا يُكشف سرّ الخدمة أبدًا.
- كل جلسة تخصّ صاحبتها: `GET/POST/DELETE` على `/api/admin/recordings/:id` تتحقق من `teacherId`.

## الملفات وتنظيف القرص

```
/data/recordings/
  sessions/<id>/state.json            حالة الجلسة + سجل التغيّرات
  sessions/<id>/chunks/chunk-000001.bin
  sessions/<id>/temp/…                ملفات FFmpeg المؤقتة
  outputs/<id>/final.mp4
  outputs/<id>/thumbnail.jpg
```

حلقة تنظيف كل 15 دقيقة (وأيضًا عند الإقلاع):

- `CHUNK_MAX_AGE_HOURS`: تحذف المقاطع الخام القديمة.
- `TEMP_MAX_AGE_HOURS`: تحذف ملفات المعالجة المؤقتة المتروكة بعد انهيار.
- `STALE_SESSION_MAX_AGE_HOURS`: تُغلق الجلسات المعلّقة (`RECORDING/UPLOADING`).
- `DISK_HIGH_WATER_MARK` / `DISK_CRITICAL_MARK`: عند تجاوزها ترفض الرفع الجديد بـ 507 قبل أن
  يمتلئ القرص، وتُبلغ `/health` بحالة `pressure: "high" | "critical"`.

## الاختبارات

```bash
# اختبارات وحدة للخدمة (توكنات، إطارات المقاطع، ضغط القرص)
cd recording-service && node --test tests

# اختبارات قاعدة الوصول (من يحق له المشاهدة)
npx vitest run tests/recording-access.test.ts

# سيناريو كامل على staging: بدء ← رفع مقاطع ← قطع شبكة ← استئناف ← finalize ← MP4 ← درس الطالبة
QA_BASE_URL=https://arabic-lms-staging.up.railway.app npx playwright test tests/e2e/07-studio.spec.ts
```

`07-studio.spec.ts` يستخدم كاميرا/مايك وهميَّين (Chromium) ويغطي:

1. بدء التسجيل ورفع مقاطع فعلية.
2. قطع الشبكة 6 ثوانٍ (إفشال طلبات المقاطع) ثم استئناف تلقائي دون فقدان أي مقطع.
3. `finalize` وظهور «التسجيل جاهز» + مدة/حجم/عدد مقاطع صحيحة.
4. الرابط المحمي: `307` ثم `video/mp4` بحجم معقول، و401 للزائر.
5. ظهور الفيديو داخل درس الطالبة المشتركة.
6. جلسة بلا مقاطع تنتهي بخطأ واضح (400) بلا تعليق.


## الاستيقاظ بعد السكون (Scale to zero)

خدمة التسجيل مضبوطة على **App Sleeping** في Railway (تتوقف عند الخمول لتوفير التكلفة). لذلك أول
طلب بعد سكونٍ طويل قد يتأخر ١٠–٣٠ ثانية، وقد يرد حافة Railway بـ 502/503 أثناء إقلاع الحاوية.
هذا **ليس خطأً** — النظام يتعامل معه كالتالي:

| المكان | السلوك |
|---|---|
| `src/lib/recording.ts` | `call()` يعيد المحاولة تلقائيًا على أخطاء الشبكة و502/503/504 بتراجع تدريجي (إنشاء الجلسة: 25ث + محاولتان، finalize: 90ث + محاولة، الحالة/الحذف/التوكن: 20–25ث) |
| `warmRecordingService()` | يستطلع `/health` حتى تجيب الخدمة (ميزانية 75 ثانية) |
| `POST /api/admin/recordings/warm` | نقطة يستدعيها الاستوديو قبل بدء أي تسجيل |
| الاستوديو | عند الضغط على «ابدئي التسجيل»: يظهر «⏳ نُجهّز خدمة التسجيل… Nث» ولا يبدأ التسجيل إلا بعد جهوزية الخدمة |
| طابور الرفع | بعد ٣ محاولات فاشلة تظهر ملاحظة «الخدمة تستيقظ — المقاطع محفوظة» ويُطلق استيقاظ تلقائي، والرفع يستأنف وحده |

**مهم**: لا تضعي للخدمة `sleepApplication` مع تخزين مؤقت على قرص الحاوية فقط — الـ Volume يبقى
مُركّبًا عبر السكون (تحقّقنا: البيانات باقية)، لكن أي ملف خارج `/data/recordings` سيضيع عند الإيقاف.
لذلك `DATA_DIR` يجب أن يطابق مسار الـ Volume دائمًا.


### نتيجة الاختبار الفعلي على Railway (مهم)

قِسنا السكون مباشرة عبر `uptimeSec` في `/health` بعد ١٣ دقيقة خمول كامل، لخدمتين: خدمة التسجيل
(بها Volume) وخدمة اختبار بلا Volume. **كلتاهما بقيت مستيقظة** (`uptimeSec` = 796 و3233 ثانية،
والاستجابة 0.6 ثانية) رغم أن `sleepApplication: true` مضبوط، أي أن Railway لم يُنِم الحاويتين في
بيئتنا. الخلاصة العملية:

- الكود الآن **جاهز للحالتين**: إن نامت الخدمة فعلًا سيعمل الاستيقاظ التلقائي، وإن بقيت مستيقظة فلا
  أثر لذلك على السرعة.
- لا تعتمدي على السكون لتوفير التكلفة في هذه الخدمة؛ استهلاكها وقت الخمول ضئيل أصلًا (Node + ffmpeg
  خامل). والأهم: سكون الخدمة أثناء حصة جارية يضيف زمن استيقاظ في منتصف التسجيل.
- إن أردتِ لاحقًا سكونًا حقيقيًا: الخدمة يجب أن تصبح **بلا حالة** (المقاطع والمخرجات في R2 بدل
  الـ Volume)، وحينها يصبح السكون آمنًا تمامًا. هذا تحويل متوسط الحجم وليس مطلوبًا الآن.

### كيف تختبرين الاستيقاظ فعليًا
1. اتركي الخدمة بلا أي طلب ~١٠ دقائق (أو أوقفيها يدويًا من Railway).
2. تأكدي أنها نائمة: `curl -o /dev/null -w "%{http_code}" https://<service>/health` → ليست 200.
3. افتحي `/admin/studio` واضغطي «ابدئي التسجيل» → يظهر عدّاد التجهيز ثم يبدأ التسجيل.
4. أو آليًا: `npx playwright test tests/e2e/07-studio.spec.ts` — يجب أن ينتهي بفيديو READY.

## أخطاء واجهناها وحلولها (مرجع سريع)

| العرض | السبب | الحل |
|---|---|---|
| الرفع لا يبدأ أبدًا، لا طلبات على الخدمة | `NEXT_PUBLIC_RECORDING_SERVICE_URL` غير محقون في الحزمة (بناء Docker لا يستقبل ARG) | تعريف `ARG` + تمرير الرابط من السيرفر كخاصية |
| `dockerfile invalid: docker VOLUME ...` | Railway يرفض تعليمة `VOLUME` | حذفها وإنشاء Volume من واجهة Railway |
| `data dir C:/Users/.../data/recordings` | Git Bash حوّل `/data/recordings` إلى مسار Windows | `MSYS_NO_PATHCONV=1` عند ضبط المتغيّر |
| `The argument 'flags' is invalid. Received 'wb'` | Node يرفض `fs.open(..., "wb")` | استخدام `"w"` |
| «unknown session» بعد الرفع | كتابة `state.json` متزامنة مع تقدّم FFmpeg أتلفت الملف | كتابة متسلسلة + `tmp` ثم `rename` + ذاكرة احتياطية |
| «بعض المقاطع لم تُرفع بعد» | الطابور توقّف بعد حد المحاولات | إعادة محاولة دائمة + مؤقّت كل 5 ثوانٍ |
| عدّاد المقاطع 0 بعد الجهوزية | `...extra` في `publicState` طغى على القيمة المخزّنة | حساب `max(المخزّن, على القرص)` بعد الـ spread |
| خطأ TLS عند تشغيل الفيديو في الاختبار | Railway يقطع اتصالًا بعد إجهاض بث فيديو | `getWithRetry` في الاختبارات + عرض الفيديو من الخدمة مباشرة |
| «خدمة التسجيل لا تستجيب» أول الدرس | الخدمة كانت نائمة (Scale to zero) | استيقاظ تلقائي + إعادة محاولات (انظر قسم الاستيقاظ) |
