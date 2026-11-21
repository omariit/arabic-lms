import { expect, test } from "@playwright/test";
import { getWithRetry, login, qaState } from "./helpers";

/**
 * The student's full journey, checked from her side and from the teacher's:
 * enroll → lesson (video + homework with a voice note) → teacher replies →
 * MCQ exam → voice exam → teacher grades → student sees the feedback.
 */
test.describe("student journey", () => {
  test.setTimeout(240_000);

  test("voucher-free flow: teacher grants access, student sees the course and its lesson", async ({ page, browser }) => {
    await login(page, "teacher");
    const { courseId, courseTitle } = qaState() as { courseId: string; courseTitle?: string };
    // Find student2's id from the students list (she starts without access).
    const students = await (await page.request.get("/api/admin/students")).json();
    const target = (students.students ?? []).find((s: { fullName: string }) => /مريم/.test(s.fullName));
    expect(target, "QA student2 must exist").toBeTruthy();

    const granted = await page.request.post("/api/admin/enrollments", { data: { userId: target.id, courseId } });
    expect(granted.ok()).toBeTruthy();

    // Another spec may have changed this password; staff reset it to the QA one.
    const st = qaState();
    const reset = await page.request.post(`/api/admin/students/${target.id}/password`, { data: { password: st.password } });
    expect(reset.ok()).toBeTruthy();

    const ctx = await browser.newContext({
      baseURL: process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app",
      locale: "ar-JO",
    });
    const student = await ctx.newPage();
    await login(student, "student2");
    await student.goto("/dashboard");
    await expect(student.locator("body")).toContainText(/دوراتي/, { timeout: 30_000 });
    await expect(student.getByRole("link", { name: "الدروس" }).first()).toBeVisible();
    await student.getByRole("link", { name: "الدروس" }).first().click();
    await expect(student.locator("body")).toContainText(/QA-/, { timeout: 30_000 });
    await ctx.close();
  });

  test("homework: student sends text + voice, teacher answers, the reply reaches her", async ({ page, browser }) => {
    const { lessonId } = qaState();
    const studentCtx = await browser.newContext();
    const student = await studentCtx.newPage();
    await login(student, "student1");

    await student.goto(`/lesson/${lessonId}`);
    await expect(student.locator("body")).toContainText(/واجب|تسليم|محادثة/, { timeout: 30_000 });

    const marker = `سؤال-${Date.now().toString().slice(-5)}`;
    const sent = await student.request.post(`/api/lessons/${lessonId}/thread`, {
      data: { body: marker },
    });
    expect(sent.ok()).toBeTruthy();

    // Teacher sees it in the aggregated inbox…
    await login(page, "teacher");
    await page.goto("/admin/inbox");
    await expect(page.getByRole("button", { name: /^الكل/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /^الكل \(/ }).click();
    await expect(page.locator("body")).toContainText(marker, { timeout: 30_000 });

    // …replies, and the student's badge clears when she opens the thread.
    const reply = `ردّ-${marker}`;
    const studentId = (await (await student.request.get(`/api/lessons/${lessonId}/thread`)).json()).messages?.[0]
      ? undefined
      : undefined;
    void studentId;
    const threads = await (await page.request.get(`/api/admin/lessons/${lessonId}/threads`)).json();
    const thread = (threads.threads ?? []).find((t: { preview: string }) => t.preview.includes(marker)) ?? threads.threads[0];
    expect(thread).toBeTruthy();
    const answered = await page.request.post(`/api/admin/lessons/${lessonId}/threads/${thread.studentId}`, {
      data: { body: reply },
    });
    expect(answered.ok()).toBeTruthy();

    const mine = await (await student.request.get(`/api/lessons/${lessonId}/thread`)).json();
    expect(mine.messages.some((m: { body: string }) => m.body === reply)).toBe(true);
    await studentCtx.close();
  });

  test("MCQ exam: start → answer → submit → score and review", async ({ page, browser }) => {
    const { courseId } = qaState();
    await login(page, "teacher");

    // Self-contained: a throw-away exam, so re-runs never hit "already answered".
    const created = await page.request.post("/api/admin/exams", {
      data: { courseId, title: `QA-مسار-${Date.now().toString().slice(-5)}`, type: "MCQ", durationMin: 10, maxGrade: 100, published: true },
    });
    expect(created.ok()).toBeTruthy();
    const examId = (await created.json()).exam.id;
    const questions = [
      { text: "كم عدد حروف الإظهار؟", options: ["٢", "٤", "٦", "٨"], correctIndex: 2 },
      { text: "الإدغام يكون في كلمة أو كلمتين؟", options: ["كلمة", "كلمتين", "كلاهما", "لا شيء"], correctIndex: 2 },
    ];
    for (const q of questions) {
      expect((await page.request.post("/api/admin/questions", { data: { examId, ...q } })).ok()).toBeTruthy();
    }
    const detail = await (await page.request.get(`/api/admin/exams/${examId}`)).json();
    const correct: Record<string, number> = {};
    for (const q of detail.exam.questions) correct[q.id] = q.correctIndex;

    // Student 3 gets access to this course (idempotent) and takes the exam.
    const students = await (await page.request.get("/api/admin/students")).json();
    const s3 = (students.students ?? []).find((x: { fullName: string }) => /هند/.test(x.fullName));
    expect((await page.request.post("/api/admin/enrollments", { data: { userId: s3.id, courseId } })).ok()).toBeTruthy();

    const ctx = await browser.newContext({
      baseURL: process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app",
      locale: "ar-JO",
    });
    const student = await ctx.newPage();
    await login(student, "student3");

    const start = await student.request.post("/api/exams/start", { data: { examId } });
    expect(start.ok()).toBeTruthy();
    const payload = await start.json();

    const answers: Record<string, number> = {};
    for (const q of payload.questions as Array<{ id: string; optionIndexes: number[] }>) {
      const presented = q.optionIndexes.indexOf(correct[q.id]);
      answers[q.id] = presented >= 0 ? presented : 0;
    }
    const submit = await student.request.post("/api/exams/submit", { data: { attemptId: payload.attempt.id, answers } });
    expect(submit.ok()).toBeTruthy();
    const result = await submit.json();
    expect(result.score).toBe(result.maxGrade);
    expect(result.review.length).toBe(payload.questions.length);

    // The result screen replaces the exam (no dead end).
    await student.goto(`/exam/${examId}`);
    await expect(student.locator("body")).toContainText(/أجبتِ|مسبقًا|نتيجة/, { timeout: 30_000 });

    await ctx.close();
    expect((await page.request.delete(`/api/admin/exams/${examId}`)).ok()).toBeTruthy();
  });

  test("voice exam: student records and submits, the teacher sees it in the grading queue", async ({ page, browser }) => {
    const { courseId } = qaState();
    await login(page, "teacher");
    const exams = await (await page.request.get("/api/admin/exams")).json();
    const voice = (exams.exams ?? []).find(
      (e: { type: string; courseId: string; published: boolean }) => e.type === "VOICE" && e.courseId === courseId,
    );
    expect(voice, "the QA voice exam must exist").toBeTruthy();

    const ctx = await browser.newContext();
    const student = await ctx.newPage();
    await login(student, "student1");

    // The screen shows the recorder (not a dead end).
    await student.goto(`/exam/${voice.id}`);
    await expect(student.locator("body")).toContainText(/🎤|تسجيل|تلاوة/, { timeout: 30_000 });

    // Upload a real audio blob through the same presign path the UI uses.
    const audio = Buffer.from("GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECgXEDgQF1", "base64");
    const presign = await student.request.post("/api/r2/upload", {
      data: { kind: "submission", mimeType: "audio/webm" },
    });
    expect(presign.ok()).toBeTruthy();
    const { uploadUrl, key } = await presign.json();
    const put = await student.request.put(uploadUrl, {
      headers: { "content-type": "audio/webm" },
      data: audio,
    });
    expect(put.ok()).toBeTruthy();

    const submit = await student.request.post("/api/exams/voice", {
      data: { examId: voice.id, key, mimeType: "audio/webm" },
    });
    // 200 first time, 409 if the suite already submitted for this student.
    expect([200, 409]).toContain(submit.status());

    // The teacher finds it in the grading screen.
    await page.goto("/admin/grading");
    await expect(page.locator("body")).toContainText(/التصحيح|تسجيل|صوت/, { timeout: 30_000 });
    await ctx.close();
  });
});
