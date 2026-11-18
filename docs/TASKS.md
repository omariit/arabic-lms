# LMS Build — Task Tracker (source prompt: prompt.md)

Project: `D:\training-course\lms` — Next.js (App Router, TS, standalone) Arabic RTL LMS for Railway Hobby plan.

## Tasks — ALL COMPLETE ✅
- [x] 0. Scaffold: package.json, tsconfig, next.config (output: standalone), Tailwind, postcss, .env.example, git init
- [x] 1. Phase 1 — prisma/schema.prisma: User, Session (deviceFingerprint+IP lock), TeacherProfile, TeacherOAuthToken, Course, Module, Lesson, Enrollment, EnrollmentRequest, Voucher, Exam, Question, ExamAttempt, AudioSubmission, LiveSession, SecurityViolation, AttendanceLog — all relational indexes. Prisma client generates clean.
- [x] 2. Phase 2 — Security: middleware (HMAC cookie verify), HMAC session cookies, single-device fingerprint validator, rate limiter, 60s signed one-time video tokens (/api/video/token → /api/video/play), ProtectedPlayer (custom fullscreen on wrapper div, anti-click shield, 8s moving watermark name+phone, MutationObserver → destroy player + SecurityViolation)
- [x] 3. Phase 3 — useAudioRecorder (webm/opus → mp4/aac fallback, max duration, preview, re-record), R2 presigned PUT/GET, MCQ engine (countdown, auto-submit, tab-switch → SecurityViolation, server-side grading + review), teacher voice feedback grading queue (grade + text + voice note via R2)
- [x] 4. Phase 4 — YouTube OAuth connect + callback, one-click launcher (liveBroadcasts.insert unlisted+embed+bind stream, deep link youtube://studio), Socket.io + WebRTC audio-only mesh in server.js, raise-hand queue, teacher mic muted by default + reminder banner, attendance logging
- [x] 5. Phase 5 — Landing (profile/methodology/achievements/catalog), login/register, student dashboard, course pages, lesson pages, exam pages, live classroom, admin mobile dashboard (courses/exams/enrollments/vouchers/grading/students/violations/profile/live)
- [x] 6. Dockerfile (node:20-alpine, multi-stage, non-root, HEALTHCHECK, STOPSIGNAL), .dockerignore, /api/health (DB check + session pruning), graceful shutdown in server.js
- [x] 7. README with exact Railway CLI steps (railway init, add postgres, variables, up, domain, seed, verify)
- [x] 8. Build & verify: `next build` passes (type-check clean), smoke test: pages 200, Socket.io transport 200, middleware redirect 307, health endpoint degrades gracefully without DB
