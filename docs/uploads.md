# Uploads — browser → R2 direct (the backend never carries file bytes)

Every file in مُقْرِئَة (voice answers, teacher voice replies, lesson recordings, transfer
receipts) follows **one** path. No route in `src/app/api` parses `multipart/form-data`, buffers
an upload, or proxies bytes: the server only ever mints a URL and later reads a key.

```
browser ──① POST /api/r2/upload ─────────────▶ app server
         ◀── ② { uploadUrl, key } ─────────────  (5-minute presigned PUT, metadata only)
browser ──③ PUT uploadUrl (bytes) ───────────▶ Cloudflare R2
browser ──④ POST feature endpoint {key} ─────▶ app server
         ◀── ⑤ verifyUpload(): HEAD key ───────  (exists? size? mime? right namespace?)
```

`src/lib/upload-client.ts → uploadToR2()` implements ①–③ and returns the key;
`src/lib/r2.ts → verifyUpload()` implements ⑤.

## The single presign endpoint

`POST /api/r2/upload` — `{ kind, mimeType, forUser? }`

| kind | who | MIME | limit | key namespace |
|---|---|---|---|---|
| `submission` | any signed-in user | webm/mp4/aac/ogg/mpeg | 20 MB | `submission/{YYYY-MM-DD}/{userId}/{uuid}` |
| `feedback` | staff only | audio | 20 MB | `feedback/{date}/{studentId}/{uuid}` |
| `lesson` | staff only | audio | 40 MB | `lesson/{date}/{userId}/{uuid}` |
| `receipt` | any signed-in user | jpeg/png/webp/heic/pdf | 8 MB | `receipt/{date}/{userId}/{uuid}` |

`forUser` (student id) is only honoured for `feedback`, so a teacher's note lands in the
namespace of the student it is addressed to.

## Where each flow registers its key

| Feature | Endpoint | Stored as |
|---|---|---|
| Student assignment voice note | `POST /api/lessons/[id]/thread` | `LessonMessage.audioKey` |
| Teacher voice reply (lesson inbox) | `POST /api/admin/lessons/[id]/threads/[studentId]` | `LessonMessage.audioKey` |
| Voice exam answer | `POST /api/exams/voice` | `AudioSubmission.audioKey` |
| Teacher voice correction | `POST /api/admin/grading` | `ExamAttempt.feedbackAudioKey` |
| Lesson recording by the teacher | `PUT /api/admin/lessons/[id]` | `Lesson.audioKey` |
| Transfer receipt screenshot | `POST /api/student/enroll-request` | `EnrollmentRequest.receiptKey` |

Every one of them calls `verifyUpload(key, kind, ownerId)`, which rejects
(400 `مفتاح الملف غير صالح`) a key outside the expected namespace, a missing object, an
empty object, an oversized object, or a wrong content type — all with a HEAD request,
so the app server still downloads nothing.

## Playback

Object keys are never exposed as public URLs. Playback always asks the app for a
short-lived presigned GET:

- `/api/lessons/[id]/audio` — teacher's lesson recording (enrolled students / staff)
- `/api/lessons/audio/[messageId]` — voice note inside a lesson thread (owner student / staff)
- `/api/r2/audio/[id]` — voice exam submission (owner student / any staff)
- `/api/exams/feedback/[attemptId]` — the correction card: grade + note + voice feedback URL
- `GET /api/admin/enrollments` — inlines a 10-minute `receiptUrl` per pending request

## Bucket configuration (already applied)

Private bucket `muqriaa`, CORS allowing `PUT`/`GET`/`HEAD` from the production origin
(plus localhost for development), `ETag` exposed. No public bucket access and no
`r2.dev` URL is needed, which is what keeps the audio private.

## Adding a new upload

1. Add a `kind` to `UPLOAD_KINDS` and `UploadKind` in `src/lib/r2.ts`.
2. Client: `const up = await uploadToR2(file, { kind })`.
3. Server: `await verifyUpload(up.key, kind, ownerId)` before storing the key.
4. Playback: presign with `presignGet()` in a route that checks ownership.
