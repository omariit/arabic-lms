---
name: lms-recording-pipeline
description: Use when touching lesson recording (Teaching Studio, recording-service, chunk uploads, FFmpeg finalize, playback access) in the arabic-lms project — covers the data flow, invariants, scale-to-zero wake-up, and the failure modes that already cost us a day
---

# Lesson recording pipeline (arabic-lms)

## Architecture in one screen

```
Teacher browser ──POST /api/admin/recordings──────────▶ Next app ──▶ RecordingSession row
      │                  (returns id + uploadToken)
      ├──PUT {service}/sessions/{id}/chunks/{n}────────▶ recording-service (Node, ffmpeg, Railway Volume)
      ├──POST /api/admin/recordings/{id}/finalize──────▶ app ──▶ service: join + transcode → final.mp4
      └──GET  /api/recordings/{id}/video ──307──▶ service /video.mp4?t=<token>   (Range supported)
```

The app **never handles video bytes**. It proxies control JSON (shared secret) and redirects playback
to a short-lived token, so bandwidth and memory stay on the recording service.

Files: `recording-service/{server.js,lib.js,pipeline.js}`, `src/lib/recording.ts` (service client),
`src/lib/recording-access.ts` (pure access rule), `src/app/admin/studio/studio.tsx` (MediaRecorder +
retrying upload queue), `docs/recording.md` (full reference).

## Invariants you must not break

1. **State writes are serialised and atomic** — `writeState()` in `server.js` queues one writer per
   session, writes `state.json.tmp`, then renames. Concurrent `fs.writeFile` from FFmpeg progress
   produced truncated JSON and the API answered `unknown session` mid-recording.
2. **Never let a stale in-memory default win** — `publicState(state, extra)` spreads `extra` *first*,
   then computes `chunkCount: Math.max(state.chunkCount, extra.chunkCount)`. When `extra` was spread
   last, the post-processing disk scan (0 chunks) erased the real count.
3. **Uploads are never dropped** — the queue retries forever (reset counter every N failures, 5s
   safety interval re-drains). A 30-second 4G drop must heal with zero lost chunks.
4. **Access rule lives in one place** — `canViewRecording({role, userId, teacherId, lesson, enrolled})`
   in `src/lib/recording-access.ts`, unit-tested. Both video and thumbnail routes call it.
5. **Node FS flags** — use `"w"`, never `"wb"` (`fs.open(..., "wb")` throws
   `The argument 'flags' is invalid` and silently failed every finalize).

## Third video source: the explanation board (BoardStage)

`BoardStage` publishes `canvas.captureStream(30)` and the studio records it exactly like a camera or
a shared screen. Rules that keep it working:

1. Keep the callback identity stable (`useCallback` in the studio) — otherwise React re-runs the
   capture effect on every render and the stream ref flickers to null.
5. Files are parsed in the browser (`src/lib/board-pages.ts`): pdf.js for PDF, JSZip for .docx/.pptx.
   The pdf worker must exist in `public/` — `npm run prebuild` copies it, so **build before deploy**.
6. Screen share goes through the same canvas (video element → drawImage), which is how annotations
   appear on top of a shared screen in the recording.
2. The stage must stay **mounted** from idle through `finishing`; unmounting stops the canvas track
   and the recorder gets no frames.
3. Require at least one image before starting (the button is disabled), and keep redrawing even when
   nothing changes — a silent canvas can starve the encoder.
4. iOS has no `getDisplayMedia`: default to this source when it is missing.

## Scale-to-zero (Railway app sleeping)

The service sleeps when idle, so the first request of the day may take 10–30s and the edge returns
502/503 meanwhile. Never treat that as a teacher error:

- `call()` in `src/lib/recording.ts` takes `{timeoutMs, retries, retryDelayMs}` and retries network
  errors plus 502/503/504 with backoff; `finalize` gets 90s + 1 retry, create gets 25s + 2 retries.
- `warmRecordingService(budgetMs = 75_000)` polls `/health` until it answers.
- `POST /api/admin/recordings/warm` exposes it; the studio calls it **before** creating a session and
  shows «نُجهّز خدمة التسجيل… Nث» instead of a failure.
- Chunk upload failures ≥ 3 in the studio also trigger a wake attempt and an amber "service is waking"
  note, because the queue keeps the chunks locally.

Verify a sleeping service by hitting `/health` until it fails, then running
`tests/e2e/07-studio.spec.ts` — the run must still end with a READY MP4.

## Failure → cause → fix (already paid for)

| Symptom | Cause | Fix |
|---|---|---|
| No chunk requests at all in the browser | `NEXT_PUBLIC_*` not inlined by the Docker build | declare `ARG`+`ENV` in `Dockerfile` **and** pass the URL from the server component as a prop |
| `dockerfile invalid: docker VOLUME ...` | Railway rejects `VOLUME` | delete the line; mount a Railway Volume at `/data/recordings` |
| `data dir C:/Users/.../data/recordings` | Git Bash rewrote `/data/recordings` | set env with `MSYS_NO_PATHCONV=1` |
| `unknown session` after uploads | concurrent `state.json` writes | serialised + atomic writes |
| finalize always failed | `fs.open(..., "wb")` | `"w"` |
| counters show 0 after READY | `...extra` spread order | `Math.max(state, disk)` computed after the spread |
| TLS `bad record mac` on video in tests | Railway edge aborts a mid-flight media stream | `getWithRetry()` helper; retry, don't assert |
| Recording duplicated on a lesson | one recording per lesson by design (409) | delete the old one or pick another lesson; QA seed clears recordings |

## Extending

- New upload kind or limit → `CONFIG` in `recording-service/server.js` + `docs/recording.md` table.
- New consumer (e.g. parent view) → call `canViewRecording` and add a case to
  `tests/recording-access.test.ts` **before** touching the route.
- Runbook: `node --test recording-service/tests`, `npx vitest run tests/recording-access.test.ts`,
  then `tests/e2e/07-studio.spec.ts` on staging.
