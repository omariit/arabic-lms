---
name: lms-qa-playwright
description: Use when running, fixing, or extending the Playwright QA suite for arabic-lms (staging E2E, production read-only smoke, test data seeding, flaky-login/TLS handling)
---

# QA suite for arabic-lms

## Rules

1. **UI tests run on staging only.** Production gets `tests/e2e/06-smoke.spec.ts` (read-only, creates
   and deletes nothing) with `QA_SMOKE=1`.
2. **Every run starts from a fresh seed.** `prisma/seed-qa.mjs` is guarded (`QA_SEED=1`, refuses the
   production proxy) and recreates the QA course, recordings, exams, threads, voucher and users.
3. **A test asserts behaviour, not the network.** Railway flakes (cold starts, TLS drops on media
   streams) are retried inside helpers, never relaxed into vague assertions.

## Commands

```bash
# staging data + full suite
SPW=$(railway variables -e staging -s Postgres --kv | grep -o "^POSTGRES_PASSWORD=.*" | cut -d= -f2-)
QA_SEED=1 DATABASE_URL="postgresql://postgres:${SPW}@shinkansen.proxy.rlwy.net:14090/railway" node prisma/seed-qa.mjs
QA_BASE_URL=https://arabic-lms-staging.up.railway.app npx playwright test            # ~7–12 min
QA_BASE_URL=... npx playwright test tests/e2e/07-studio.spec.ts --reporter=line      # one spec

# production, read-only
QA_SMOKE=1 SMOKE_TEACHER_PHONE=0785054355 SMOKE_TEACHER_PASSWORD='<pw>' \
  QA_BASE_URL=https://arabic-lms-production.up.railway.app npx playwright test tests/e2e/06-smoke.spec.ts
```

QA accounts (staging): `+962790000001` admin, `…0002` teacher, `…0003` assistant, `…0004/5/6` students
— password `qa-pass-2026`. State is written to `tests/e2e/.qa-state.json`.

## Coverage map

| Spec | Covers |
|---|---|
| 01-public | landing/RTL, language switch, `/courses`, login/register pages, 404, robots/sitemap/manifest/sw, noindex + redirect of private areas |
| 02-auth | staff/student login, wrong password, Arabic-Indic digits + smart dashes, tampered cookie, mid-session expiry banner, logout, role boundaries |
| 03-student | dashboard, lesson content, text+voice submissions, private chat with voice note, gated upload API, MCQ exam end-to-end, enrollment receipt |
| 04-teacher | zero failed API calls, course builder (outcomes/requirements/meetings), approve enrollment, grading queue, lesson inbox, staff creation, testimonials/vouchers, landing CMS, profile, uploads + forged key, **student password reset** |
| 05-meeting | in-house meeting: open, guest invite + knock/admit, mute/cam, hand raise, chat, end; enrolled student join |
| 06-smoke | production: public pages 200, all staff screens render with zero failed API calls |
| 07-studio | recording: start, real chunks, **6s network drop**, recovery, finalize, MP4 via 307 + Range, student sees it in the lesson, empty session fails cleanly |

## Helpers (`tests/e2e/helpers.ts`) — use them, don't reinvent

- `login(page, key)` — navigates, fills, and treats a `200` from `/api/auth/login` as success then
  navigates explicitly (client redirects were flaky on cold starts); waits out `429` buckets.
- `logout(page)`, `qaState()`, `localPhone(e164)`, `uploadViaPresign(page, kind, file, mime)`, `shot(page, name)`.
- `getWithRetry(request, url, opts)` — for media/API GETs; retries transport and 5xx errors.

## Flakes we already neutralised (don't "fix" them by weakening assertions)

| Flake | Real cause | Handling |
|---|---|---|
| login fails "still at /login" | cold start + client redirect race; 429 after many attempts | helper navigates explicitly after 200 and backs off on 429 |
| `tls_get_more_records` on video | Railway edge drops a connection when a media stream is aborted | `getWithRetry` |
| empty admin screen in a test | the screen genuinely did not auto-load (bug, not flake) | keep the assertion; fix the component |
| "lesson already has a recording" | one recording per lesson by design | seed deletes recordings; spec deletes leftovers first |
| chat voice note occasionally slow | polling loop (4–5s) | `retries: 1` in config covers it |

## Extending

- New feature → new `NN-<area>.spec.ts`, add the screen to `06-smoke.spec.ts` if staff-facing, and to
  the coverage table above. Prefer `data-testid`-free role/label locators (`getByLabel`, `getByRole`)
  because the UI is Arabic-labelled and RTL.
- Seed changes must stay idempotent (delete-then-create by `QA_` marker) so a run never depends on a
  previous one.
