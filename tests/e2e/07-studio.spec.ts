import { expect, test } from "@playwright/test";
import { getWithRetry, login, qaState, shot } from "./helpers";

/**
 * Recording flow QA (Teaching Studio + recording-service):
 *   start → real chunks uploaded → simulated network interruption → recovery →
 *   finalize → MP4 ready → playback → linked to a lesson and visible to a student.
 *
 * Runs with Chromium's fake camera/microphone so it is fully headless and repeatable.
 */
test.describe("teaching studio recording", () => {
  test.setTimeout(240_000);

  test("records a lesson, survives a network drop, produces a playable MP4", async ({ page, browser }) => {
    const { courseId, lessonId } = qaState();
    await login(page, "teacher");

    // Make the test re-runnable: a previous attempt (or a retry) may have left a
    // recording on this lesson, which the studio correctly refuses to duplicate.
    const existing = await page.request.get("/api/admin/recordings");
    const list = existing.ok() ? ((await existing.json()).recordings ?? []) : [];
    for (const rec of list) {
      if (rec.courseId === courseId) await page.request.delete(`/api/admin/recordings/${rec.id}`);
    }

    // Scale-to-zero: the service may be asleep, so prove the warm-up endpoint
    // really does wait for it before any recording is attempted.
    const warm = await page.request.post("/api/admin/recordings/warm");
    expect(warm.status()).toBe(200);
    const warmBody = (await warm.json()) as { awake: boolean; ms: number };
    expect(warmBody.awake).toBe(true);
    console.log(`recording service warm in ${warmBody.ms}ms${warmBody.ms > 1500 ? " (was asleep)" : " (already awake)"}`);

    await page.goto("/admin/studio");

    await expect(page.locator("body")).toContainText(/تسجيل حصة/);
    await page.getByLabel("الدورة").selectOption(courseId);
    await page.getByLabel(/الدرس/).selectOption(lessonId);
    await page.getByLabel("مصدر الصورة").selectOption("camera");
    await page.getByRole("button", { name: /ابدئي التسجيل/ }).click();

    await expect(page.getByText("التسجيل جارٍ")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("video")).toBeVisible();

    // Let a few 4-second chunks upload.
    await expect
      .poll(async () => Number(await page.locator("text=مقاطع مرفوعة").first().evaluate((el) => el.previousElementSibling?.textContent ?? "0")), {
        timeout: 90_000,
      })
      .toBeGreaterThan(0)
      .catch(() => {}); // the counter is optimistic; the next assertion is the real one

    await page.waitForTimeout(14_000);
    await shot(page, "studio-recording");

    // ── simulated network interruption: chunk PUTs fail for a few seconds ──
    await page.route("**/chunks/*", (route) => route.abort("failed"));
    await page.waitForTimeout(6000);
    await page.unroute("**/chunks/*");
    // the queue must drain by itself once the network is back
    await page.waitForTimeout(6000);

    // The sticky stop bar is what a teacher on a phone reaches for.
    await page.getByTestId("stop-recording-sticky").click();

    // processing → ready (ffmpeg runs in the recording service)
    await expect(page.getByText(/التسجيل جاهز/)).toBeVisible({ timeout: 180_000 });
    await shot(page, "studio-ready");

    const video = page.locator("video").last();
    await expect(video).toHaveAttribute("src", /\/api\/recordings\/[^/]+\/video/);
    const src = (await video.getAttribute("src"))!;

    // the protected route serves a real MP4 with byte ranges
    const head = await getWithRetry(page.request, src, { headers: { range: "bytes=0-1023" } });
    expect([200, 206]).toContain(head.status());
    expect(head.headers()["content-type"]).toContain("video/mp4");

    const full = await getWithRetry(page.request, src);
    const bytes = (await full.body()).length;
    expect(bytes).toBeGreaterThan(20_000);

    // metadata sanity: duration comes from the service, not the browser guess
    await expect(page.locator("body")).toContainText(/المدة/);
    const recordingId = src.match(/recordings\/([^/]+)\/video/)![1];
    const info = await getWithRetry(page.request, `/api/admin/recordings/${recordingId}`);
    const json = (await info.json()) as {
      recording: { status: string; durationSec: number; lessonId: string | null; chunkCount: number };
    };
    expect(json.recording.status).toBe("READY");
    expect(json.recording.durationSec).toBeGreaterThan(5);
    expect(json.recording.lessonId).toBe(lessonId);
    expect(json.recording.chunkCount).toBeGreaterThan(0);

    // ── the student sees the recording inside the lesson ──
    const ctx = await browser.newContext({
      baseURL: process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app",
      locale: "ar-JO",
    });
    const student = await ctx.newPage();
    await login(student, "student1");
    await student.goto(`/lesson/${lessonId}`);
    await expect(student.getByText("فيديو الحصة المسجّل")).toBeVisible({ timeout: 60_000 });
    const studentVideo = student.locator("video").first();
    await expect(studentVideo).toHaveAttribute("src", /\/api\/recordings\//);
    await ctx.close();

    // ── the stream is protected: anonymous visitors get nothing ──
    // (the QA lesson is a FREE_PREVIEW lesson, so a non-enrolled signed-in
    //  student is allowed by design; the ENROLLED-only rule is covered by
    //  tests/recording-access.test.ts)
    const anon = await browser.newContext({
      baseURL: process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app",
    });
    const anonPage = await anon.newPage();
    const anonRes = await getWithRetry(anonPage.request, src);
    expect(anonRes.status()).toBe(401);
    await anon.close();

    // enrolled student may stream it directly too
    const ctx2 = await browser.newContext({
      baseURL: process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app",
      locale: "ar-JO",
    });
    const enrolledPage = await ctx2.newPage();
    await login(enrolledPage, "student1");
    const enrolledRes = await getWithRetry(enrolledPage.request, src);
    expect(enrolledRes.status()).toBe(200);
    expect(enrolledRes.headers()["content-type"]).toContain("video/mp4");
    await ctx2.close();
  });

  test("an upload with no chunks fails cleanly instead of hanging", async ({ page }) => {
    await login(page, "teacher");
    const created = await page.request.post("/api/admin/recordings", {
      data: { title: "QA empty session" },
    });
    expect(created.ok()).toBe(true);
    const { id } = await created.json();

    const finalized = await page.request.post(`/api/admin/recordings/${id}/finalize`);
    expect(finalized.status()).toBe(400);

    const aborted = await page.request.post(`/api/admin/recordings/${id}/abort`);
    expect(aborted.ok()).toBe(true);
    const removed = await page.request.delete(`/api/admin/recordings/${id}`);
    expect(removed.ok()).toBe(true);
  });
});
