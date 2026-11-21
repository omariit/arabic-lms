import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * The lecture must actually show video both ways, report its quality, and end for
 * everyone when the teacher leaves through «إنهاء وخروج».
 */
test.describe("live lecture: video, quality panel, ending", () => {
  test("video flows both ways, the quality panel reports it, and the teacher's exit closes the room", async ({
    page,
    browser,
  }) => {
    test.setTimeout(420_000);
    const base = process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app";

    await login(page, "teacher");
    await page.goto("/admin/live");
    await page.getByLabel("الدورة").selectOption({ label: "QA-دورة اختبار الجودة" });
    await page.getByRole("button", { name: /ابدئي حصة داخلية/ }).click();
    await expect(page.getByText(/الحصة الداخلية جاهزة/)).toBeVisible({ timeout: 60_000 });
    await page.getByRole("link", { name: /دخول غرفة الحصة/ }).click();
    await page.waitForURL(/\/live\//);
    const liveId = new URL(page.url()).pathname.split("/").pop()!;

    const ctx = await browser.newContext({ baseURL: base, locale: "ar-JO", permissions: ["microphone", "camera"] });
    const student = await ctx.newPage();
    await login(student, "student1");
    await student.goto(`/live/${liveId}`);
    await expect(student.getByText(/دردشة الحصة|مشاركة/).first()).toBeVisible({ timeout: 90_000 });

    // ── the host allows the student's camera, then both cameras go on ──
    const studentRow = page.locator("li", { hasText: "سارة الاختبار" }).first();
    await expect(studentRow).toBeVisible({ timeout: 90_000 });
    await studentRow.getByRole("button", { name: "سماح بالكاميرا" }).click();
    // the student must have received the permission before she can switch the camera on
    await expect(student.getByText(/يمكنك تشغيل الكاميرا/)).toBeVisible({ timeout: 60_000 });
    await student.getByRole("button", { name: /الكاميرا مغلقة/ }).click();
    await expect(student.getByRole("button", { name: /الكاميرا شغالة/ })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /الكاميرا مغلقة/ }).click();
    await expect(page.getByRole("button", { name: /الكاميرا شغالة/ })).toBeVisible({ timeout: 60_000 });

    /** The panel's own numbers are the proof: resolution only exists for inbound video. */
    const openPanel = async (target: typeof page) => {
      if (!(await target.getByTestId("net-stats").isVisible().catch(() => false))) {
        await target.getByTestId("net-stats-toggle").click();
      }
      await expect(target.getByTestId("net-stats")).toBeVisible();
      return target.getByTestId("net-stats-row").first();
    };

    const teacherRow = await openPanel(page);
    await expect(teacherRow).toContainText("سارة الاختبار");
    await expect(teacherRow).toContainText(/\d+×\d+/, { timeout: 90_000 });

    const studentRowStats = await openPanel(student);
    await expect(studentRowStats).toContainText("أ. خولة");
    await expect(studentRowStats).toContainText(/\d+×\d+/, { timeout: 90_000 });

    // Real pictures on both screens: her own preview *and* the other party's tile.
    const playingTiles = async (target: typeof page) =>
      target.locator("video").evaluateAll((els) =>
        els.filter((v) => {
          const el = v as HTMLVideoElement;
          const tracks = (el.srcObject as MediaStream | null)?.getVideoTracks?.() ?? [];
          return el.videoWidth > 0 && !el.paused && tracks.some((t) => t.readyState === "live");
        }).length,
      );
    await expect.poll(() => playingTiles(page), { timeout: 90_000, intervals: [1000, 2000, 3000] }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => playingTiles(student), { timeout: 90_000, intervals: [1000, 2000, 3000] }).toBeGreaterThanOrEqual(2);

    // ── the panel hides again and does not cover the stage ──
    await page.getByTestId("net-stats-toggle").click();
    await expect(page.getByTestId("net-stats")).toHaveCount(0);

    // ── sharing buttons are visible, not buried in the chat ──
    await expect(page.getByTestId("share-file")).toBeVisible();
    await expect(page.getByTestId("share-screen")).toBeVisible();
    await expect(student.getByTestId("share-file")).toBeVisible();

    // ── the teacher leaves through the exit button: the lecture ends for everyone ──
    page.on("dialog", (d) => d.accept());
    await page.getByTestId("leave-room").click();
    await expect(student.locator("body")).toContainText(/أنهت المعلمة الحصة|انتهت مشاركتك/, { timeout: 90_000 });
    await page.waitForURL(/\/admin\/live|\/admin/, { timeout: 60_000 });

    // the room is locked: the student cannot re-enter
    await student.goto(`/live/${liveId}`);
    await expect(student.locator("body")).toContainText(/انتهت|منتهية|غير متاحة|لا يمكن/, { timeout: 60_000 });

    await ctx.close();
  });
});
