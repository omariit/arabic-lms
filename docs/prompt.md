# System Role & Objective
Act as a Principal Full-Stack Software Architect and DevOps Engineer. Your task is to architect, build, secure, and containerize a complete, production-grade, **cost-optimized** single-teacher Educational Learning Management System (LMS) from scratch, ready to be deployed to **Railway (Hobby Plan $5/mo)** via Railway CLI as a completely new, isolated project.

# Core Tech Stack (Production-Grade & Cost-Optimized)
- **Framework:** Next.js (App Router) with TypeScript for full-stack performance, SSR, and API routes (configured with `output: 'standalone'`).
- **Styling & UI:** Tailwind CSS + Shadcn/UI + Arabic Typography (`Cairo` / `Tajawal` via `next/font/google`) with strict RTL Arabic-first, mobile-first design.
- **Database & ORM:** PostgreSQL with Prisma ORM (optimized for Railway PostgreSQL with proper indexing).
- **Authentication & Security:** Auth.js (NextAuth v5) or custom JWT with HTTP-Only cookies, strict Role-Based Access Control (`ADMIN` for the single teacher, `STUDENT` for learners), single-device session enforcement via **Device Fingerprinting**, and API Rate Limiting.
- **Video Hosting & Live Video Stream:** YouTube Unlisted Videos & YouTube Unlisted Live Streams automated via **YouTube Data API v3** (zero video storage or bandwidth load on Railway).
- **Real-Time Audio Interaction (Voice-Only):** Self-hosted **Socket.io + Native WebRTC (Audio-Only)** running on the same Node/Next.js server (zero external minute limits, ultra-low RAM/CPU footprint).
- **Audio File Storage:** Cloudflare R2 (Free Tier - dedicated private bucket for student audio exam submissions and teacher audio feedback notes, accessed via short-lived S3-compatible Presigned URLs).
- **Containerization & Deployment:** Multi-stage production `Dockerfile` + `.dockerignore` + health check endpoint + Railway CLI deployment configuration.

---

# Detailed Functional & Security Specifications

## 1. Realistic Anti-Piracy, Tokenized YouTube Wrapper & Tamper-Proof Watermark
Since all recorded lessons and live video broadcasts are hosted on YouTube (Unlisted), implement layered, realistic protection focused on deterrence and access control:
- **Short-Lived Signed Video Tokens:** Never expose raw YouTube URLs/IDs in static responses. Issue a short-lived (60-second expiry) signed/encrypted payload with a unique `nonce` from `/api/video/token` only after verifying active enrollment, rate limits, and single-device fingerprint match.
- **Custom Protected YouTube Player Container:**
  - Wrap the YouTube IFrame API inside a custom `div` container with custom playback controls (Play/Pause, Seek, Speed, Volume, and **Custom Fullscreen**).
  - **Custom Fullscreen Rule:** Trigger `.requestFullscreen()` on the **parent wrapper `div`**, NOT the YouTube iframe, keeping overlays visible in fullscreen mode.
  - **Transparent Anti-Click Shield:** Place a `pointer-events: auto` transparent overlay over the iframe to block right-click, "Copy video URL", "Watch on YouTube", and casual inspection.
- **Dynamic Anti-Tamper Watermark & Security Logging:**
  - Render a moving overlay displaying the logged-in student's **Full Name + Phone Number** shifting to random coordinates inside the video container every 8 seconds.
  - **MutationObserver Protection:** Watch the watermark DOM node strictly. If a user deletes, hides (`display: none`, `opacity: 0`), or modifies the watermark via DevTools, immediately destroy the player instance and record a violation in the `SecurityViolation` database table.

## 2. One-Click Mobile Live Class Launcher (Zero-Tech Teacher UX)
The teacher operates the platform **exclusively from her smartphone** with zero technical background. Eliminate manual copying/pasting of YouTube links or stream keys:
- **YouTube Data API v3 Automation:**
  - Configure Google OAuth2 for the teacher's YouTube channel (storing `refresh_token` securely in `TeacherOAuthToken` so she connects once during setup).
  - When the teacher taps **"ابدأ الحصة المباشرة الآن" (Start Live Class Now)** on her mobile dashboard:
    1. The backend automatically calls `youtube.liveBroadcasts.insert` (`privacyStatus: "unlisted"`, `enableEmbed: true`) and binds a stream via YouTube API.
    2. The backend captures the generated YouTube `videoId`, saves it to the active `LiveSession` in PostgreSQL, initializes the Socket.io/WebRTC Audio Room, and unlocks the classroom for enrolled students.
    3. Her mobile screen displays a single deep-link button to open her YouTube app broadcast screen immediately, alongside a large-button mobile moderation drawer.
- **Mobile-First Teacher Admin UI:**
  - Large touch-friendly Arabic buttons, simplified workflows, and quick audio moderation controls while streaming.

## 3. Hybrid Live Classroom & Echo-Free Audio Architecture
Build a "Live Classroom" view merging the YouTube Live video broadcast with real-time WebRTC voice interaction while preventing audio echo/feedback loops:
- **Video Layer (One-Way from Teacher):** Embeds the teacher's Unlisted YouTube Live Stream inside the protected, watermarked player wrapper.
- **Audio-Only Interactive Layer (Socket.io + WebRTC):**
  - **Echo-Free Routing:** The teacher broadcasts video and voice via YouTube Live, while her microphone in the website's WebRTC voice room is **muted by default** (with an easy toggle and a prominent reminder banner: *"يرجى استخدام سماعات بلوتوث لمنع صدى الصوت"*) so students never hear doubled audio.
  - Students join muted by default and tap **"رفع اليد" (Raise Hand)**. The teacher sees the queue on her phone and grants/revokes microphone permission to one student at a time so the whole class hears the live question clearly.
  - Automatic attendance logging when students join the live session.

## 4. Dual Examination & Assessment Engine (Cross-Browser Compatible)
Build two exam modules inside the course curriculum:

### A. Auto-Graded Electronic Exams
- Support Multiple Choice (MCQ) and True/False questions.
- Countdown timer, auto-submit on expiration, tab-switch detection warning logged to `SecurityViolation`, and instant automated grading with answer review.

### B. Voice-Based Exams with Manual Teacher Grading & Voice Feedback
- **Cross-Browser Audio Recording (iOS Safari + Android/Desktop Chrome):**
  - Build a smart `useAudioRecorder` hook detecting `MediaRecorder.isTypeSupported` (`audio/webm;codecs=opus` for Chrome/Android, falling back automatically to `audio/mp4` / `audio/aac` for iOS Safari) with a max recording duration limit, progress bar, preview playback, and re-record option before submission.
- **Cloudflare R2 Presigned Upload:**
  - Generate short-lived S3 Presigned PUT URLs pointing to a dedicated private R2 bucket (`R2_BUCKET_NAME`) so audio files upload directly from the browser to Cloudflare R2 without burdening Railway RAM/bandwidth.
- **Teacher Mobile Grading & Voice Feedback Queue:**
  - Mobile-friendly Admin view to listen to student audio submissions (via Presigned GET URLs), assign a numerical grade, write text notes, AND record a **Voice Feedback Note** directly from her phone's browser attached to the student's attempt.

## 5. Single-Teacher Brand, Profile & Enrollment Management
- **Public Landing Page:** Dynamic content driven by `TeacherProfile` (teacher's bio, teaching methodology, achievements, student testimonials) + course catalog with free preview lessons + lightweight PWA manifest for mobile home-screen installation.
- **Enrollment & Payment Workflow:**
  - Support student `EnrollmentRequest` submissions (e.g., uploading receipt reference for local CliQ/bank transfers) with one-tap approval in the teacher's Admin Dashboard, PLUS single-use `Voucher` access codes.
- **Admin Dashboard:** Mobile-optimized management for Teacher Profile, Courses, Modules, Lessons, Scheduled Live Classes, Exam Builder, Voucher Generator, Student Device Lock Reset, Security Violation Logs, and Voice Grading Queue.

---

# Execution Plan (Step-by-Step)
Build this project systematically in clean, complete phases without skipping code details or using placeholders:

1. **Phase 1: Project Initialization & Complete Database Schema**
   - Next.js App Router (TypeScript, Tailwind CSS, RTL Arabic layout with Cairo/Tajawal font).
   - Complete `prisma/schema.prisma` including: `User`, `Session` (with `deviceFingerprint` & IP lock), `TeacherProfile`, `TeacherOAuthToken`, `Course`, `Module`, `Lesson`, `Enrollment`, `EnrollmentRequest`, `Voucher`, `Exam`, `Question`, `ExamAttempt`, `AudioSubmission`, `LiveSession`, and `SecurityViolation` — with all necessary relational indexes.
2. **Phase 2: Security Middleware, Device Lock & Protected YouTube Player**
   - Rate-limited short-lived signed video token API (`/api/video/token`), single-device fingerprint validator, custom fullscreen wrapper, moving watermark, and `MutationObserver` tamper logger.
3. **Phase 3: Cross-Browser Voice Recorder, Cloudflare R2 Integration & Exam Engines**
   - `useAudioRecorder` hook (iOS Safari + Android compatible), Cloudflare R2 Presigned URL endpoints, Auto-graded MCQ engine, and Teacher Mobile Voice Feedback dashboard.
4. **Phase 4: One-Click YouTube Live API & Echo-Free WebRTC Voice Classroom**
   - Google OAuth2 + YouTube Data API v3 broadcast creator endpoint, mobile teacher launcher UI, and the Live Classroom combining the protected YouTube Live embed with the Socket.io/WebRTC audio raise-hand room.
5. **Phase 5: Production Dockerization & Railway CLI Deployment**
   - Multi-stage production `Dockerfile` (`node:20-alpine` with `output: 'standalone'`), `.dockerignore`, `/api/health` endpoint, and graceful shutdown handling.
   - Exact **Railway CLI** commands to create a **brand-new isolated project** (`railway init`), attach PostgreSQL, configure all environment variables, and deploy without touching any existing Railway projects.

