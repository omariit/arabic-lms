# منصة المعلمة — Single-Teacher Arabic LMS (Railway-Ready)

Production-grade, cost-optimized Arabic (RTL, mobile-first) learning management system
built with **Next.js App Router + TypeScript**, **PostgreSQL + Prisma**, **Socket.io + WebRTC
audio**, **YouTube Data API v3**, and **Cloudflare R2** — packaged in a multi-stage Docker
image ready for the **Railway Hobby plan ($5/mo)**.

## Feature map (prompt → implementation)

| Spec area | Where |
|---|---|
| Auth (JWT-style HMAC, HTTP-only cookie) | `src/lib/auth.ts`, `src/lib/crypto.ts`, `src/middleware.ts` |
| Single-device lock (device fingerprint + IP) | `src/lib/crypto.ts#fingerprintFrom`, `src/lib/auth.ts#getCurrentUser`, `prisma/schema.prisma#Session` |
| API rate limiting | `src/lib/rate-limit.ts` (used by login/register/video/exam/live/voucher routes) |
| 60s signed video tokens (`/api/video/token`) | `src/app/api/video/token/route.ts`, one-time nonce exchange in `src/app/api/video/play/route.ts` |
| Protected YouTube player (custom fullscreen on wrapper, anti-click shield, moving watermark, MutationObserver tamper kill) | `src/components/protected-player.tsx`, violation log → `/api/security/violation` |
| One-click live launcher (YouTube API v3 broadcast+stream, unlisted+embed, deep link) | `src/lib/youtube.ts`, `src/app/api/live/start/route.ts`, `src/app/admin/one-click-launcher.tsx` |
| Echo-free live classroom (YouTube video one-way + WebRTC audio-only raise-hand room, teacher mic muted by default, attendance) | `server.js` (Socket.io signaling), `src/components/live-room.tsx` |
| Cross-browser voice recorder (webm/opus → mp4/aac fallback) | `src/hooks/use-audio-recorder.ts` |
| Cloudflare R2 presigned PUT/GET (private bucket, zero Railway bandwidth) | `src/lib/r2.ts`, `src/app/api/r2/upload`, `src/app/api/r2/audio/[id]` |
| Auto-graded MCQ engine (timer, auto-submit, tab-switch violation logging, review) | `src/app/exam/[id]/exam-runner.tsx`, `/api/exams/*` |
| Voice exam + teacher mobile voice feedback grading | `src/app/exam/[id]/voice-exam.tsx`, `/api/admin/grading`, `src/app/admin/grading/` |
| Teacher profile/brand, enrollment requests (CliQ receipt), single-use vouchers | `src/app/page.tsx`, `src/app/courses/[id]/enroll-actions.tsx`, `/api/admin/vouchers`, `/api/admin/enrollments` |
| Admin mobile dashboard (courses/modules/lessons, exams, violations, device reset) | `src/app/admin/**`, `/api/admin/**` |
| Health endpoint + graceful shutdown | `src/app/api/health/route.ts`, `server.js` (SIGTERM → io.disconnectSockets + prisma.$disconnect) |

## Project structure

```
lms/
├── server.js                  # Node entry: Next.js + Socket.io + WebRTC signaling + graceful shutdown
├── prisma/schema.prisma       # Complete DB schema (all spec models + indexes)
├── prisma/seed.mjs            # ADMIN teacher + sample course
├── Dockerfile                 # node:20-alpine, multi-stage, HEALTHCHECK, SIGTERM
├── railway.json               # Dockerfile builder + migrate-deploy start command + healthcheck
└── src/
    ├── middleware.ts          # Edge route guard (HMAC cookie verification)
    ├── lib/                   # auth, crypto, rate-limit, r2, youtube, db
    ├── components/            # protected-player, live-room, ui primitives
    ├── hooks/use-audio-recorder.ts
    └── app/                   # pages + API routes
```

## Local development

```bash
npm install
cp .env.example .env          # fill in values
npx prisma migrate dev        # create local DB schema
node prisma/seed.mjs          # teacher account + sample course
npm run dev                   # server.js (Next + Socket.io) on :3000
```

Teacher login: seeded phone `0700000000` / `changeme-teacher-1` (change via env `ADMIN_PHONE`/`ADMIN_PASSWORD`).

## Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Railway PostgreSQL connection string |
| `AUTH_SECRET` | HMAC signing key for session/video tokens (`openssl rand -hex 32`) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Cloudflare R2 private audio bucket |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth for the teacher's YouTube channel |
| `NEXT_PUBLIC_APP_URL` | Public URL (OAuth redirect + Socket.io CORS) |
| `PORT` | set by Railway |

Google Cloud console: create an OAuth Client (Web) with redirect URI
`{NEXT_PUBLIC_APP_URL}/api/admin/oauth/youtube/callback`, enable **YouTube Data API v3**.

Cloudflare R2: create a **private** bucket, generate an S3-compatible API token, keep all
objects server-side accessed (presigned URLs only — the bucket is never public).

---

# Deployment to Railway (CLI, brand-new isolated project)

> These commands create a **completely new Railway project** — existing projects are untouched.
> Prereq: `npm i -g @railway/cli`, then `railway login`.

```bash
# 1. Create a brand-new isolated project (never touches other projects)
cd lms
railway init --name arabic-lms

# 2. Attach PostgreSQL to this project only
railway add --database postgres

# 3. Set all environment variables (generate AUTH_SECRET with: openssl rand -hex 32)
railway variables --set \
  "AUTH_SECRET=$(openssl rand -hex 32)" \
  "R2_ACCOUNT_ID=your-account-id" \
  "R2_ACCESS_KEY_ID=your-r2-key" \
  "R2_SECRET_ACCESS_KEY=your-r2-secret" \
  "R2_BUCKET_NAME=lms-audio" \
  "GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com" \
  "GOOGLE_CLIENT_SECRET=your-client-secret"

# DATABASE_URL is injected automatically by the Railway Postgres plugin.
# NEXT_PUBLIC_APP_URL is set after the first deploy reveals the public domain (step 5).

# 4. Deploy (Dockerfile is auto-detected via railway.json)
railway up

# 5. Grab the public domain, then set NEXT_PUBLIC_APP_URL and redeploy
railway domain                       # prints e.g. https://arabic-lms-production.up.railway.app
railway variables --set "NEXT_PUBLIC_APP_URL=https://arabic-lms-production.up.railway.app"
railway up                           # redeploy with the OAuth redirect configured

# 6. Seed the teacher account against the deployed database
railway run -- node prisma/seed.mjs

# 7. Verify
curl https://arabic-lms-production.up.railway.app/api/health
```

### Post-deploy checklist

1. Log in as the teacher → **الإعداداتي** → connect the YouTube channel (one-time Google consent).
2. Fill the teacher profile (bio, methodology, CliQ alias for enrollment receipts).
3. Create courses/modules/lessons, publish, and try **🔴 ابدئي الحصة المباشرة الآن**.
4. Register a student phone, approve an enrollment request (or issue a voucher), and verify:
   watermarked playback, raise-hand audio room, MCQ exam timer, voice exam submission, and the voice grading queue.

### Railway plan notes (Hobby $5/mo)

- **Zero video bandwidth** — recorded lessons and live streams are YouTube unlisted embeds.
- **Zero audio-file bandwidth** — student/teacher audio uploads/downloads go browser ↔ Cloudflare R2 via 5–10 minute presigned URLs.
- **One process** — Next.js SSR + Socket.io/WebRTC signaling share the same Node server (no second service to pay for).
- **Scale-to-zero compatible** — enable *Serverless / autoscale to 0* on the service in the Railway dashboard:
  - Cold start after idle is ~30–60s (container boot + `prisma migrate deploy` + server start). First visitor waits; subsequent requests are fast.
  - While anyone is inside a live classroom the client pings `/api/health` every 25s, so an active class is **never** scaled down mid-session.
  - All durable state lives in PostgreSQL (sessions, attempts, attendance) — restarts and cold starts lose nothing. The only in-memory state (rate-limit buckets, one-time video nonces, Socket.io rooms) is short-lived by design and safe to lose on a spin-down.
  - Note: Railway PostgreSQL itself does not scale to zero; it is the one always-on component.
- Streaming uses `transport: websocket` with polling fallback; WebRTC audio-only keeps CPU/RAM minimal.
