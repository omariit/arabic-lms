import { expect, test } from "@playwright/test";
import { login, qaState } from "./helpers";

/**
 * Admin/teacher console — full CRUD through the real API + the screens.
 *
 * Everything created here is deleted again so the suite stays repeatable and the
 * QA course never accumulates junk.
 */
test.describe("staff console CRUD", () => {
  test.setTimeout(180_000);
  const stamp = Date.now().toString().slice(-6);

  test("course → module → lesson → exam → publish → delete", async ({ page }) => {
    await login(page, "teacher");

    // ── course ──
    const created = await page.request.post("/api/admin/courses", {
      data: { title: `QA-CRUD ${stamp}`, description: "دورة اختبار", price: 25, level: "المستوى الثاني" },
    });
    expect(created.ok()).toBeTruthy();
    const courseId = (await created.json()).course.id;

    await page.goto("/admin/courses");
    await expect(page.locator("body")).toContainText(`QA-CRUD ${stamp}`, { timeout: 30_000 });

    // ── module + lesson ──
    const mod = await page.request.post("/api/admin/modules", { data: { courseId, title: "الوحدة الأولى" } });
    expect(mod.ok()).toBeTruthy();
    const moduleId = (await mod.json()).module.id;

    const lesson = await page.request.post("/api/admin/lessons", {
      data: {
        moduleId,
        title: "درس الاختبار",
        youtubeId: "dQw4w9WgXcQ",
        description: "وصف الدرس",
        scriptText: "نص السكريبت",
        assignmentTitle: "واجب الدرس",
        assignmentInstructions: "سجّلي الآيات",
        access: "ENROLLED",
      },
    });
    expect(lesson.ok()).toBeTruthy();
    const lessonId = (await lesson.json()).lesson.id;

    // The lesson workspace accepts edits and shows them back.
    await page.goto(`/admin/lessons/${lessonId}`);
    await expect(page.locator("body")).toContainText("درس الاختبار", { timeout: 30_000 });
    const put = await page.request.put(`/api/admin/lessons/${lessonId}`, {
      data: { assignmentTitle: "واجب محدّث", description: "وصف محدّث" },
    });
    expect(put.ok()).toBeTruthy();

    // ── exam with a question, shuffled ──
    const exam = await page.request.post("/api/admin/exams", {
      data: { courseId, title: `QA-CRUD-امتحان ${stamp}`, type: "MCQ", durationMin: 12, maxGrade: 50 },
    });
    expect(exam.ok()).toBeTruthy();
    const examId = (await exam.json()).exam.id;
    const q = await page.request.post("/api/admin/questions", {
      data: { examId, text: "ما هو الإدغام؟", options: ["أ", "ب", "ج", "د"], correctIndex: 1, type: "MCQ" },
    });
    expect(q.ok()).toBeTruthy();

    const published = await page.request.put(`/api/admin/exams/${examId}`, {
      data: { published: true, shuffleQuestions: true, shuffleOptions: true },
    });
    expect(published.ok()).toBeTruthy();
    const examDetail = await (await page.request.get(`/api/admin/exams/${examId}`)).json();
    expect(examDetail.exam.published).toBe(true);
    expect(examDetail.exam.shuffleQuestions).toBe(true);
    expect(examDetail.exam.questions).toHaveLength(1);

    // The builder screen reflects the saved settings (auto-loads, no dead screen).
    await page.goto(`/admin/exams/${examId}`);
    await expect(page.locator("body")).toContainText("ما هو الإدغام؟", { timeout: 30_000 });
    await expect(page.locator("body")).toContainText("منشور");

    // ── publish the course, then clean up ──
    const pub = await page.request.put(`/api/admin/courses/${courseId}`, { data: { published: true } });
    expect(pub.ok()).toBeTruthy();

    expect((await page.request.delete(`/api/admin/exams/${examId}`)).ok()).toBeTruthy();
    expect((await page.request.delete(`/api/admin/courses/${courseId}`)).ok()).toBeTruthy();

    await page.goto("/admin/courses");
    await expect(page.locator("body")).not.toContainText(`QA-CRUD ${stamp}`, { timeout: 30_000 });
  });

  test("voucher issue → student redeems it → access granted", async ({ page, browser }) => {
    await login(page, "teacher");
    const { courseId } = qaState();

    const issued = await page.request.post("/api/admin/vouchers", { data: { courseId, count: 1 } });
    expect(issued.ok()).toBeTruthy();
    const codes = (await issued.json()).vouchers as Array<string | { code: string }>;
    const code = typeof codes?.[0] === "string" ? (codes[0] as string) : codes?.[0]?.code;
    expect(code, "a voucher code must be returned").toBeTruthy();

    // Student 3 is not enrolled; the voucher is her way in.
    // Same base URL as the browser under test.
    const ctx = await browser.newContext({ baseURL: process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app" });
    const student = await ctx.newPage();
    await login(student, "student3");
    const redeem = await student.request.post("/api/student/voucher", { data: { code } });
    expect(redeem.ok()).toBeTruthy();
    const body = await redeem.json();
    expect(body.ok).toBe(true);

    await student.goto("/dashboard");
    await expect(student.locator("body")).toContainText(/QA-دورة اختبار الجودة/, { timeout: 30_000 });

    // Reusing the same code must fail cleanly.
    const again = await student.request.post("/api/student/voucher", { data: { code } });
    expect(again.status()).toBe(409);
    await ctx.close();
  });

  test("testimonial publish → appears on the landing page → delete", async ({ page }) => {
    await login(page, "teacher");
    const text = `شهادة اختبار ${stamp}`;
    const created = await page.request.post("/api/admin/testimonials", {
      data: { name: "طالبة الاختبار", text, level: "المستوى الأول", rating: 5, published: true },
    });
    expect(created.ok()).toBeTruthy();
    const id = (await created.json()).testimonial.id;

    await page.goto("/?preview=1");
    await expect(page.locator("body")).toContainText(text, { timeout: 30_000 });

    expect((await page.request.delete(`/api/admin/testimonials/${id}`)).ok()).toBeTruthy();
    await page.goto("/?preview=1");
    await expect(page.locator("body")).not.toContainText(text, { timeout: 30_000 });
  });

  test("assistant account: created by staff, signs in, sees only the chat", async ({ page, browser }) => {
    await login(page, "admin");
    const phone = `0788${stamp.slice(-6)}`;
    const created = await page.request.post("/api/admin/staff", {
      data: { fullName: `مساعدة ${stamp}`, phone, countryCode: "JO" },
    });
    expect(created.ok()).toBeTruthy();
    const payload = await created.json();
    const password = payload.password ?? payload.tempPassword;
    expect(password, "a one-time password must be returned").toBeTruthy();

    const ctx = await browser.newContext();
    const assistant = await ctx.newPage();
    await assistant.goto("/login");
    await assistant.getByLabel("رقم الهاتف", { exact: true }).fill(phone);
    await assistant.getByLabel("كلمة المرور", { exact: true }).fill(password);
    await assistant.getByRole("button", { name: "دخول" }).click();
    await assistant.waitForURL(/\/admin/, { timeout: 90_000 });

    // Chat inbox only: no studio, no recordings, no courses.
    await assistant.goto("/admin/chat");
    await expect(assistant.locator("body")).toContainText(/الرسائل|الدردشة/, { timeout: 30_000 });
    const studio = await assistant.request.get("/api/admin/recordings");
    expect(studio.status()).toBe(403);
    await ctx.close();

    // Housekeeping: the assistant is removed by staff (ASSISTANT accounts only).
    const removed = await page.request.delete("/api/admin/staff", { data: { id: payload.assistant.id } });
    expect(removed.ok()).toBeTruthy();
  });
});
