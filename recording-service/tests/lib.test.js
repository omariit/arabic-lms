import test from "node:test";
import assert from "node:assert/strict";
import {
  chunkFileName,
  clampPercent,
  cleanupPlan,
  describeChunks,
  diskPressure,
  looksLikeStandaloneMp4,
  progressSeconds,
  signToken,
  verifyToken,
} from "../lib.js";

const SECRET = "test-secret-32-characters-long!!";

test("tokens round-trip and reject tampering / expiry", () => {
  const token = signToken(SECRET, { sid: "abc123", kind: "upload" }, 60);
  const payload = verifyToken(SECRET, token, "upload");
  assert.equal(payload.sid, "abc123");
  assert.equal(verifyToken(SECRET, token, "view"), null, "wrong kind rejected");
  assert.equal(verifyToken("other-secret", token), null, "wrong secret rejected");
  assert.equal(verifyToken(SECRET, `${token}x`), null, "tampered signature rejected");
  assert.equal(verifyToken(SECRET, ""), null);
  const expired = signToken(SECRET, { sid: "abc123", kind: "view" }, -10);
  assert.equal(verifyToken(SECRET, expired), null, "expired token rejected");
});

test("chunk names are zero-padded and parseable", () => {
  assert.equal(chunkFileName(7), "chunk-000007.bin");
  assert.deepEqual(describeChunks(["chunk-000003.bin", "chunk-000001.bin", "junk.txt"]), {
    count: 2,
    first: 1,
    last: 3,
    missing: [2],
  });
  assert.deepEqual(describeChunks([]), { count: 0, first: null, last: null, missing: [] });
});

test("detects standalone MP4 vs continuous webm fragments", () => {
  const mp4 = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
  assert.equal(looksLikeStandaloneMp4(mp4), true);
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04]);
  assert.equal(looksLikeStandaloneMp4(webm), false);
});

test("disk guards escalate at the configured watermarks", () => {
  assert.equal(diskPressure({ usedPct: 40, highWaterMark: 80, criticalMark: 90 }), "ok");
  assert.equal(diskPressure({ usedPct: 85, highWaterMark: 80, criticalMark: 90 }), "high");
  assert.equal(diskPressure({ usedPct: 95, highWaterMark: 80, criticalMark: 90 }), "critical");
  assert.deepEqual(cleanupPlan("critical"), ["temp", "chunks", "aborted-sessions", "old-outputs"]);
  assert.ok(cleanupPlan("high").includes("temp"));
  assert.ok(cleanupPlan("ok").includes("stale-sessions"));
});

test("ffmpeg progress parsing + percent clamp", () => {
  assert.equal(progressSeconds("out_time_ms=1500000\nprogress=continue"), 1.5);
  assert.equal(progressSeconds("out_time_us=2500000"), 2.5);
  assert.equal(progressSeconds("nothing"), null);
  assert.equal(clampPercent(103.4), 100);
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent(Number.NaN), 0);
});
