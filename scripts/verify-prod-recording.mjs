import { chromium } from "@playwright/test";

/**
 * Production verification of the recording feature including the scale-to-zero
 * wake-up path. Records ~8s, waits for the MP4, checks playback, then deletes the
 * test recording so production stays clean.
 *
 * Run: node scripts/verify-prod-recording.mjs
 */
const BASE = "https://arabic-lms-production.up.railway.app";
const PHONE = process.env.VERIFY_PHONE || "0785054355";
const PASSWORD = process.env.VERIFY_PASSWORD || "";

if (!PASSWORD) {
  console.error("set VERIFY_PASSWORD (teacher password) to run this check");
  process.exit(1);
}

const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const ctx = await browser.newContext({ baseURL: BASE, locale: "ar-JO", permissions: ["microphone", "camera"] });
const page = await ctx.newPage();
const failures = [];
page.on("pageerror", (e) => failures.push(String(e).slice(0, 160)));
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 400) failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
});

await page.goto("/login", { waitUntil: "networkidle" });
await page.getByLabel("رقم الهاتف").fill(PHONE);
await page.getByLabel("كلمة المرور").fill(PASSWORD);
await page.getByRole("button", { name: /دخول/ }).click();
await page.waitForURL(/\/admin/, { timeout: 120000 });
console.log("teacher logged in");

// 1) wake-up path (the service sleeps when idle)
const warm = await page.request.post("/api/admin/recordings/warm");
const warmBody = await warm.json();
console.log(`warm: ${warm.status()} awake=${warmBody.awake} in ${warmBody.ms}ms${warmBody.ms > 1500 ? " (was asleep)" : " (already awake)"}`);

await page.goto("/admin/studio");
const courses = (await (await page.request.get("/api/admin/courses")).json()).courses ?? [];
const course = courses.find((c) => c.modules?.some((m) => m.lessons?.length));
if (!course) throw new Error("no course with lessons on production");
const lesson = course.modules.flatMap((m) => m.lessons)[0];

const existing = (await (await page.request.get("/api/admin/recordings")).json()).recordings ?? [];
for (const r of existing.filter((x) => x.lessonId === lesson.id)) {
  await page.request.delete(`/api/admin/recordings/${r.id}`);
  console.log("removed previous test recording", r.id);
}

await page.getByLabel("الدورة").selectOption(course.id);
await page.getByLabel(/الدرس/).selectOption(lesson.id);
await page.getByLabel("مصدر الصورة").selectOption("camera");
await page.getByRole("button", { name: /ابدئي التسجيل/ }).click();
await page.getByText("التسجيل جارٍ").waitFor({ timeout: 90000 });
await page.waitForTimeout(9000);
await page.getByRole("button", { name: /إنهاء الحصة واستخراج الفيديو/ }).click();
await page.getByText(/التسجيل جاهز/).waitFor({ timeout: 180000 });

const video = page.locator("video").last();
const src = await video.getAttribute("src");
const media = await page.request.get(src);
console.log("media:", media.status(), media.headers()["content-type"], (await media.body()).length, "bytes");
const played = await video.evaluate(async (el) => {
  await el.play().catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  return { t: Number(el.currentTime.toFixed(2)), d: Number(el.duration.toFixed(2)) };
});
console.log("playback:", played);

const recId = src.match(/recordings\/([^/]+)\/video/)[1];
const info = (await (await page.request.get(`/api/admin/recordings/${recId}`)).json()).recording;
console.log("recording:", info.status, `${info.durationSec}s`, `${info.chunkCount} chunks`);
console.log("cleanup:", (await page.request.delete(`/api/admin/recordings/${recId}`)).status());
console.log("page errors / failed api:", failures.length ? failures : "none");
await browser.close();
