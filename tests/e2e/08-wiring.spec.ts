import { expect, test } from "@playwright/test";
import { login, qaState } from "./helpers";

/**
 * Cross-role wiring: everything the student does must surface for the teacher,
 * and no screen may send her back to the marketing landing page.
 */
test.describe("wiring between student and teacher", () => {
  test("a signed-in student is sent to her dashboard instead of the landing page", async ({ page }) => {
    await login(page, "student1");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    expect(new URL(page.url()).pathname).toBe("/dashboard");
    // The student navigation is present on every student screen.
    await expect(page.getByRole("link", { name: "المقررات" })).toBeVisible();
  });

  test("the student dashboard shows her courses and never links to the landing page", async ({ page }) => {
    await login(page, "student1");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /دوراتي/ })).toBeVisible();
    const landingLinks = await page.locator('a[href="/"]').count();
    expect(landingLinks).toBe(0);
  });

  test("teacher sees the student's homework in the inbox and can open it", async ({ page }) => {
    await login(page, "teacher");
    await page.goto("/admin/inbox", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /واجبات الطالبات/ })).toBeVisible();
    // The QA seed creates one thread; show every conversation, not just unread.
    // Wait for the list to load (the tab carries the count), then switch filter.
    await expect(page.getByRole("button", { name: /^الكل \([1-9]/ })).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: /^الكل \(/ }).click();
    const row = page.locator("a[href^='/admin/lessons/']").first();
    await expect(row).toBeVisible({ timeout: 30000 });
    await row.click();
    await page.waitForURL(/\/admin\/lessons\/.+\?student=/, { timeout: 30000 });
    await expect(page.getByText(/سؤال اختبار|تسجيل صوتي/).first()).toBeVisible();
  });

  test("the two 'recordings' nav items are now clearly different", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /تسجيلات الحصص/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /طلبات الانتساب/ })).toBeVisible();
  });

  test("shuffled questions and options still grade a correct answer as correct", async ({ page }) => {
    const { courseId } = qaState();

    // Teacher builds a throw-away exam so the test never depends on earlier runs.
    await login(page, "teacher");
    const created = await (await page.request.post("/api/admin/exams", {
      data: { courseId, title: `QA-خلط ${Date.now()}`, type: "MCQ", durationMin: 10, maxGrade: 100, published: true },
    })).json();
    const examId = created.exam.id;
    expect(examId).toBeTruthy();

    const questions = [
      { text: "سؤال أول", options: ["أ", "ب", "ج", "د"], correctIndex: 2 },
      { text: "سؤال ثانٍ", options: ["١", "٢", "٣", "٤"], correctIndex: 0 },
    ];
    for (const q of questions) {
      const res = await page.request.post("/api/admin/questions", { data: { examId, ...q } });
      expect(res.ok()).toBeTruthy();
    }
    await page.request.put(`/api/admin/exams/${examId}`, { data: { shuffleQuestions: true, shuffleOptions: true } });

    // Correct indexes come from the teacher's session — students never see them.
    const detail = await (await page.request.get(`/api/admin/exams/${examId}`)).json();
    const correct: Record<string, number> = {};
    for (const q of detail.exam.questions) correct[q.id] = q.correctIndex;

    // Student starts the attempt and answers every question correctly using the
    // PRESENTED index, which is what the UI sends.
    await login(page, "student1");
    const start = await page.request.post("/api/exams/start", { data: { examId } });
    expect(start.ok()).toBeTruthy();
    const payload = await start.json();
    expect(Array.isArray(payload.questions)).toBeTruthy();
    expect(payload.questions[0].optionIndexes).toBeTruthy();

    const answers: Record<string, number> = {};
    for (const q of payload.questions as Array<{ id: string; optionIndexes: number[] }>) {
      const presented = q.optionIndexes.indexOf(correct[q.id]);
      answers[q.id] = presented >= 0 ? presented : 0;
    }

    const submit = await page.request.post("/api/exams/submit", {
      data: { attemptId: payload.attempt.id, answers },
    });
    expect(submit.ok()).toBeTruthy();
    const result = await submit.json();
    expect(result.score).toBe(result.maxGrade);

    await login(page, "teacher");
    await page.request.delete(`/api/admin/exams/${examId}`);
  });
});
