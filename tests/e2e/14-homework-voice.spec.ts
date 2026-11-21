import { expect, test } from "@playwright/test";
import { login, qaState } from "./helpers";

/**
 * Voice correction on homework: the teacher records with the mic button, sends the
 * recording, and the student can play it back. This is the button that looked dead
 * because media errors were swallowed.
 */
test.describe("homework voice correction", () => {
  test("teacher records a voice correction and the student hears it", async ({ page, browser }) => {
    test.setTimeout(300_000);
    const { lessonId } = qaState();
    const base = process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app";

    // a real homework message from the student
    const sctx = await browser.newContext({ baseURL: base, locale: "ar-JO" });
    const student = await sctx.newPage();
    await login(student, "student1");
    const sent = await student.request.post(`/api/lessons/${lessonId}/thread`, {
      data: { body: `تسميع الدرس — ${Date.now().toString().slice(-4)}` },
    });
    expect(sent.ok()).toBeTruthy();

    await login(page, "teacher");
    await page.goto(`/admin/lessons/${lessonId}`);
    await page.getByRole("button", { name: /صندوق الواجبات/ }).click();
    await page.getByText("سارة الاختبار").first().click({ timeout: 60_000 });

    // ── the mic button starts a real recording and says so ──
    const mic = page.getByTestId("rec-start");
    await expect(mic).toBeVisible({ timeout: 30_000 });
    await mic.click();
    await expect(page.getByText(/يسجّل الآن/)).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(2500);
    await page.getByTestId("rec-stop").click();
    await expect(page.getByTestId("rec-reset")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("rec-error")).toHaveCount(0);

    // ── the correction is sent and lands in the thread with a player ──
    const playersBefore = await page.getByRole("button", { name: /استمعي/ }).count();
    await page.getByRole("button", { name: /إرسال التصحيح/ }).click();
    await expect(page.getByTestId("rec-start")).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(() => page.getByRole("button", { name: /استمعي/ }).count(), { timeout: 60_000 })
      .toBeGreaterThan(playersBefore);

    // the stored message really carries audio (not just text)
    const thread = await (await page.request.get(`/api/admin/lessons/${lessonId}/threads`)).json();
    const withAudio = await Promise.all(
      (thread.threads ?? []).map(async (t: { studentId: string }) => {
        const res = await page.request.get(`/api/admin/lessons/${lessonId}/threads/${t.studentId}`);
        const j = await res.json();
        return (j.messages ?? []).filter((m: { audioKey?: string | null; senderRole?: string }) => m.audioKey && m.senderRole !== "STUDENT").length;
      }),
    );
    expect(withAudio.reduce((a: number, b: number) => a + b, 0)).toBeGreaterThan(0);

    // ── the student can play it back ──
    await student.goto(`/lesson/${lessonId}`);
    await student.getByRole("button", { name: /الواجب والمحادثة/ }).click();
    await expect(student.getByRole("button", { name: /استمعي/ }).first()).toBeVisible({ timeout: 60_000 });

    await sctx.close();
  });
});
