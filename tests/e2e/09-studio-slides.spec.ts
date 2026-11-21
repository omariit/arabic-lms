import { expect, test } from "@playwright/test";
import { login, qaState, shot } from "./helpers";

/**
 * Presentation board («لوحة العرض»): the studio can record images with zoom and
 * pen annotations without screen sharing — the only way to record on iPhone/iPad.
 *
 * Proves: the start button refuses an empty board, zoom works, and a short
 * recording made from the canvas really reaches READY (so the canvas stream is
 * captured, chunked and processed like any other video source).
 */
test.describe("studio presentation board", () => {
  test.setTimeout(240_000);

  test("records a lesson from an image with zoom, without screen sharing", async ({ page }) => {
    const { courseId, lessonId } = qaState();
    await login(page, "teacher");

    // One recording per lesson by design: clear leftovers so the run is repeatable.
    const existing = await page.request.get("/api/admin/recordings");
    const list = existing.ok() ? ((await existing.json()).recordings ?? []) : [];
    for (const rec of list) {
      if (rec.courseId === courseId) await page.request.delete(`/api/admin/recordings/${rec.id}`);
    }

    await page.goto("/admin/studio");
    await page.getByLabel("مصدر الصورة").selectOption("slides");
    await expect(page.getByText("🖼️ لوحة العرض", { exact: true })).toBeVisible();

    // Nothing to present yet → the recorder must refuse to start.
    const startBtn = page.getByRole("button", { name: /ابدئي التسجيل/ });
    await expect(startBtn).toBeDisabled();

    // Give it a picture (a tiny PNG is enough to prove the pipeline).
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVQoU2NkYGD4z0AEYBxVSFyIRg0aNWhUIVGjBo0aVAgAS2gEAcO1s2sAAAAASUVORK5CYII=",
      "base64",
    );
    await page.setInputFiles('input[type="file"][accept="image/*"]', {
      name: "page.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.getByText("1 / 1")).toBeVisible({ timeout: 15_000 });
    await expect(startBtn).toBeEnabled();

    // Zoom is visible to the teacher and reflected in the recorded canvas.
    await page.getByRole("button", { name: "➕" }).click();
    await expect(page.getByText("125%")).toBeVisible();
    await shot(page, "studio-slides-board");

    // Record for a few seconds from the canvas stream.
    await page.getByLabel("الدورة").selectOption(courseId);
    await page.getByLabel(/الدرس/).selectOption(lessonId);
    const marker = `QA-عرض-${Date.now().toString().slice(-5)}`;
    await page.getByLabel("عنوان التسجيل").fill(marker);
    await startBtn.click();

    await expect(page.getByText("التسجيل جارٍ")).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /إنهاء الحصة واستخراج/ }).click();

    // The pipeline must turn the canvas recording into a ready MP4.
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/admin/recordings");
          const rows = res.ok() ? ((await res.json()).recordings ?? []) : [];
          const mine = rows.find((r: { title: string }) => r.title === marker);
          return mine ? `${mine.status}:${mine.hasVideo}` : "missing";
        },
        { timeout: 150_000, intervals: [3000, 5000, 5000, 8000] },
      )
      .toBe("READY:true");

    // Clean up so the lesson is free for the next run.
    const res = await page.request.get("/api/admin/recordings");
    const rows = res.ok() ? ((await res.json()).recordings ?? []) : [];
    for (const rec of rows) {
      if (rec.title === marker) await page.request.delete(`/api/admin/recordings/${rec.id}`);
    }
  });
});
