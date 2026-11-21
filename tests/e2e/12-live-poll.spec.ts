import { expect, test } from "@playwright/test";
import { login, qaState } from "./helpers";

/**
 * In-lecture questions and attendance.
 *
 * Teacher runs a real meeting, a real student joins, the teacher asks a question with a
 * timer, the student answers, the teacher sees the count and — the point of the whole
 * feature — exactly who has not answered. Closing the question reveals the right answer,
 * the attendance log records the student, and the report page keeps all of it afterwards.
 */
test.describe("live lecture: questions + attendance", () => {
  test("teacher asks a timed question, sees who answered and who did not, and keeps an attendance record", async ({
    page,
    browser,
  }) => {
    test.setTimeout(420_000);
    const base = process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app";
    const state = qaState();

    await login(page, "teacher");

    // Three enrolled students: one attends and answers, two are the follow-up list.
    const students = await (await page.request.get("/api/admin/students")).json();
    const findByName = (re: RegExp) =>
      (students.students ?? []).find((s: { fullName: string }) => re.test(s.fullName)) as { id: string; fullName: string } | undefined;
    const s2 = findByName(/مريم/);
    const s3 = findByName(/هند/);
    expect(s2, "student2 must exist").toBeTruthy();
    for (const st of [s2!, s3!]) {
      if (!st) continue;
      expect(
        (await page.request.post("/api/admin/enrollments", { data: { userId: st.id, courseId: state.courseId } })).ok(),
      ).toBeTruthy();
    }

    await page.goto("/admin/live");
    await page.getByLabel("الدورة").selectOption({ label: "QA-دورة اختبار الجودة" });
    await page.getByRole("button", { name: /ابدئي حصة داخلية/ }).click();
    await expect(page.getByText(/الحصة الداخلية جاهزة/)).toBeVisible({ timeout: 60_000 });
    await page.getByRole("link", { name: /دخول غرفة الحصة/ }).click();
    await page.waitForURL(/\/live\//);
    const liveId = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByRole("button", { name: /إنهاء الحصة/ })).toBeVisible({ timeout: 60_000 });

    // A real student joins the lecture from her own browser.
    const ctx = await browser.newContext({ baseURL: base, locale: "ar-JO" });
    const student = await ctx.newPage();
    await login(student, "student1");
    await student.goto(`/live/${liveId}`);
    await expect(student.getByText(/مشاركة|المشاركات|دردشة الحصة/).first()).toBeVisible({ timeout: 90_000 });

    // ── the teacher asks a question with a 2-minute window ──
    await page.getByTestId("poll-open").click();
    await page.getByTestId("poll-question-input").fill("كم عدد حروف الإظهار الحلقي؟");
    const optionInputs = page.getByTestId("poll-option-input");
    await optionInputs.nth(0).fill("أربعة");
    await optionInputs.nth(1).fill("ستة");
    await page.getByTestId("poll-correct").selectOption("1");
    await page.getByTestId("poll-duration").selectOption("120");
    await page.getByTestId("poll-send").click();

    // the student receives it with a countdown
    await expect(student.getByTestId("live-poll")).toBeVisible({ timeout: 60_000 });
    await expect(student.getByTestId("live-poll")).toContainText("كم عدد حروف الإظهار الحلقي؟");
    await expect(student.getByTestId("poll-timer")).toBeVisible();

    // ── she answers «ستة» and sees her result immediately ──
    await student.getByTestId("poll-option").nth(1).click();
    await expect(student.getByTestId("poll-answered")).toContainText(/إجابة صحيحة/, { timeout: 60_000 });
    // one answer only
    await expect(student.getByTestId("poll-option").nth(0)).toBeDisabled();

    // ── the teacher's live picture ──
    await expect(page.getByTestId("poll-results")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("poll-results")).toContainText("1 إجابة", { timeout: 60_000 });
    const s1 = state.phone.student1.name;
    await expect(page.getByTestId("poll-results")).toContainText(s1, { timeout: 60_000 });
    // …and the list she actually needs: who still has not answered
    await expect(page.getByTestId("poll-missing")).toContainText(/لم تُجب/, { timeout: 60_000 });
    await expect(page.getByTestId("poll-missing")).not.toContainText(s1);
    await expect(page.getByTestId("poll-missing")).toContainText("مريم");

    // ── closing by hand reveals the right answer to everyone ──
    await page.getByTestId("poll-close").click();
    await expect(student.getByTestId("live-poll")).toContainText(/انتهى السؤال/, { timeout: 60_000 });
    await expect(student.getByTestId("live-poll")).toContainText(/ستة/, { timeout: 60_000 });

    // ── a second question: a wrong answer still gets the right one, at once ──
    await page.getByTestId("poll-open").click();
    await page.getByTestId("poll-question-input").fill("أين يقع طرف اللسان مع النون؟");
    const opts2 = page.getByTestId("poll-option-input");
    await opts2.nth(0).fill("أقصى اللسان");
    await opts2.nth(1).fill("طرف اللسان");
    await page.getByTestId("poll-correct").selectOption("1");
    await page.getByTestId("poll-duration").selectOption("0"); // the teacher closes it herself
    await page.getByTestId("poll-send").click();

    await expect(student.getByTestId("live-poll")).toContainText("أين يقع طرف اللسان مع النون؟", { timeout: 60_000 });
    await student.getByTestId("poll-option").nth(0).click(); // wrong on purpose
    await expect(student.getByTestId("poll-answered")).toContainText("الإجابة الصحيحة: طرف اللسان", { timeout: 60_000 });
    await page.getByTestId("poll-close").click();
    await expect(student.getByTestId("live-poll")).toContainText(/انتهى السؤال/, { timeout: 60_000 });

    // ── attendance of this lecture, live and afterwards ──
    await page.getByTestId("attendance").getByRole("button", { name: "تحديث" }).click();
    await expect(page.getByTestId("attendance")).toContainText(s1, { timeout: 60_000 });

    await page.goto(`/admin/live/${liveId}/report`);
    await expect(page.locator("h1")).toContainText("تقرير الحصة", { timeout: 60_000 });
    await expect(page.locator("table")).toContainText(s1, { timeout: 60_000 });
    await expect(page.getByTestId("report-poll")).toHaveCount(2);
    await expect(page.getByTestId("report-poll").first()).toContainText("كم عدد حروف الإظهار الحلقي؟");
    await expect(page.getByTestId("report-poll").first()).toContainText(s1);
    await expect(page.getByTestId("report-poll").nth(1)).toContainText("أين يقع طرف اللسان مع النون؟");
    // the wrong answer is kept as wrong in the record, with the right one beside it
    await expect(page.getByTestId("report-poll").nth(1)).toContainText("طرف اللسان");
    await expect(page.getByTestId("report-poll-missing").first()).toContainText(/لم تُجب/);

    // tidy up: end the lecture so the next run starts clean
    await ctx.close();
    page.on("dialog", (d) => d.accept());
    const end = page.getByRole("button", { name: /إنهاء الحصة/ });
    if (await end.isVisible().catch(() => false)) {
      await end.click();
      await expect(page.locator("body")).toContainText(/انتهت مشاركتك/, { timeout: 60_000 });
    }
  });
});
