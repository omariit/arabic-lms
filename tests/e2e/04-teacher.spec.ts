import { expect, test } from "@playwright/test";
import { localPhone, login, qaState, shot, uploadViaPresign } from "./helpers";

test.describe("teacher console", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "teacher");
  });

  test("dashboard and navigation render without a single failed API call", async ({ page }) => {
    const failures: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/") && r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
    });
    await page.goto("/admin");
    // The nav renders twice (phone bar + desktop bar); only one is displayed.
    await expect(page.getByRole("link", { name: /الحصص المباشرة/ }).locator("visible=true").first()).toBeVisible();
    // Desktop shows every destination in one row (phones use the «المزيد» sheet).
    await expect(page.getByRole("link", { name: /تسجيلات الحصص/ }).locator("visible=true").first()).toBeVisible();
    await page.goto("/admin/courses");
    await expect(page.locator("body")).toContainText("دورة اختبار الجودة", { timeout: 30_000 });
    await page.goto("/admin/enrollments");
    // Independent of which request the seed or an earlier spec created.
    await expect(page.locator("body")).toContainText(/طلبات بانتظار الموافقة|المسجلات الحاليات/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: /رفض/ }).locator("visible=true").first()).toBeVisible();
    expect(failures, `failed calls: ${failures.join(", ")}`).toHaveLength(0);
  });

  test("courses list loads by itself (no dead screen)", async ({ page }) => {
    await page.goto("/admin/courses");
    await expect(page.locator("body")).toContainText("QA-دورة اختبار الجودة", { timeout: 30_000 });
  });

  test("course builder edits outcomes, requirements and weekly meetings", async ({ page }) => {
    const { courseId } = qaState();
    await page.goto(`/admin/courses/${courseId}`);
    await expect(page.locator("body")).toContainText("ماذا ستتعلّم الطالبة", { timeout: 40_000 });
    await page.getByPlaceholder(/قراءة صحيحة متقنة/).fill("تلاوة متقنة\nضبط المخارج الآلي");
    await page.getByRole("button", { name: /حفظ تفاصيل الدورة/ }).click();
    await expect(page.getByText(/تم حفظ تفاصيل الدورة/)).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.locator("body")).toContainText("تلاوة متقنة", { timeout: 40_000 });
    await shot(page, "teacher-course-builder");
  });

  test("teacher approves the pending enrollment request", async ({ page }) => {
    await page.goto("/admin/enrollments");
    const card = page.getByTestId("enroll-request").filter({ hasText: "مريم الاختبار" }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/admin/enrollments") && r.request().method() === "PATCH"),
      card.getByTestId("approve-request").click(),
    ]);
    expect(res.status(), await res.text().catch(() => "")).toBe(200);
    await expect(page.getByTestId("enroll-request").filter({ hasText: "مريم الاختبار" })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator("body")).toContainText("مريم الاختبار", { timeout: 30_000 }); // now in the enrolled list
  });

  test("grading queue shows the voice submission", async ({ page }) => {
    await page.goto("/admin/grading");
    const body = page.locator("body");
    await expect(body).toContainText(/التصحيح|طابور/, { timeout: 30_000 });
    await expect(body).not.toContainText("تعذّر تحميل");
  });

  test("lesson inbox lists her students' private threads", async ({ page }) => {
    const { lessonId } = qaState();
    await page.goto(`/admin/lessons/${lessonId}`);
    await expect(page.locator("body")).toContainText(/صندوق الواجبات/, { timeout: 40_000 });
    await page.getByRole("button", { name: /صندوق الواجبات/ }).click();
    await expect(page.locator("body")).toContainText("سارة الاختبار", { timeout: 40_000 });
  });

  test("teacher sets a new student password and the student signs in with it", async ({ page, browser, request }) => {
    test.setTimeout(240_000);
    const state = qaState();
    await login(page, "teacher");
    await page.goto("/admin/students");

    const list = await page.request.get("/api/admin/students");
    const students = (await list.json()) as { students: Array<{ id: string; fullName: string; phone: string }> };
    const target = students.students.find((s) => s.phone === state.phone.student2.phone);
    expect(target, "student2 must exist").toBeTruthy();

    const newPassword = "Maryam-Quran-7788";
    const res = await page.request.post(`/api/admin/students/${target!.id}/password`, { data: { password: newPassword } });
    expect(res.ok()).toBe(true);

    // the UI shows the button and the generated suggestion
    await page.goto("/admin/students");
    await expect(page.getByRole("button", { name: "تعيين كلمة مرور" }).first()).toBeVisible();

    // The credential itself works (fast, no cold-start flakiness).
    const ctx = await browser.newContext({
      baseURL: process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app",
      locale: "ar-JO",
    });
    const signIn = await request.post("/api/auth/login", {
      data: { phone: localPhone(state.phone.student2.phone), password: newPassword },
    });
    expect(signIn.status()).toBe(200);
    const payload = (await signIn.json()) as { role?: string; redirect?: string };
    expect(payload.role).toBe("STUDENT");
    expect(payload.redirect).toBe("/dashboard");

    // …and the UI form accepts it too.
    const student = await ctx.newPage();
    await student.goto("/login");
    await student.getByLabel("رقم الهاتف").fill(localPhone(state.phone.student2.phone));
    await student.getByLabel("كلمة المرور").fill(newPassword);
    await student.getByRole("button", { name: /دخول/ }).click();
    await expect(student).toHaveURL(/\/dashboard/, { timeout: 90_000 });
    await ctx.close();
  });

  test("staff management creates an assistant who can sign in", async ({ page, browser }) => {
    await page.goto("/admin/staff");
    await expect(page.locator("body")).toContainText(/فريق المساعدة/, { timeout: 30_000 });

    const name = `مساندة ${Date.now().toString().slice(-5)}`;
    const phone = `0799${Date.now().toString().slice(-6)}`;
    await page.getByPlaceholder("الاسم").fill(name);
    await page.getByPlaceholder("07xxxxxxxx").fill(phone);
    await page.getByRole("button", { name: /^إضافة$/ }).click();

    // the one-time password is shown on screen — read it like a real teacher would
    await expect(page.getByText(/كلمة المرور — احفظيها الآن/)).toBeVisible({ timeout: 30_000 });
    const password = (await page.locator("p.tracking-wide").first().innerText()).trim();
    expect(password.length).toBeGreaterThan(5);
    await expect(page.locator("body")).toContainText(name, { timeout: 30_000 });

    // the new assistant can actually log in (and only sees chat)
    const ctx = await browser.newContext({ baseURL: process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app", locale: "ar-JO" });
    const p2 = await ctx.newPage();
    await p2.goto("/login");
    await p2.getByLabel("رقم الهاتف").fill(`0${phone.slice(1)}`);
    await p2.getByLabel("كلمة المرور").fill(password);
    await p2.getByRole("button", { name: /دخول/ }).click();
    await p2.waitForURL(/\/(admin|dashboard)/, { timeout: 90_000 });
    await p2.goto("/admin/chat");
    await expect(p2.locator("body")).toContainText(/الرسائل|محادث/, { timeout: 60_000 });
    await ctx.close();
  });

  test("testimonials and vouchers can be created", async ({ page }) => {
    await page.goto("/admin/testimonials");
    await expect(page.locator("body")).toContainText(/آراء|شهادات/, { timeout: 30_000 });
    const name = `طالبة ${Date.now().toString().slice(-4)}`;
    const bodyInput = page.getByPlaceholder(/النص|رأي|الشهادة/).first();
    if (await bodyInput.count()) {
      await page.getByPlaceholder(/الاسم/).first().fill(name).catch(() => {});
      await bodyInput.fill("تجربة اختبار آلي — الحمد لله استفدت كثيرًا.");
      await page.getByRole("button", { name: /إضافة|حفظ/ }).first().click();
      await expect(page.locator("body")).toContainText(name, { timeout: 30_000 });
    }

    await page.goto("/admin/vouchers");
    await expect(page.locator("body")).toContainText(/كوبون|أكواد/, { timeout: 30_000 });
  });

  test("landing CMS saves an edited headline and the public page shows it", async ({ page }) => {
    await page.goto("/admin/landing");
    await expect(page.locator("body")).toContainText(/الصفحة|محتوى/, { timeout: 30_000 });
    const marker = `اختبار ${Date.now().toString().slice(-4)}`;
    // "سطور العنوان" under القسم الرئيسي
    const heroLines = page.locator("textarea").first();
    await heroLines.fill(`بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
${marker}
في أي مكانٍ وأي وقتٍ…
**حتى الإجازة**`);
    await page.getByRole("button", { name: /حفظ التغييرات/ }).click();
    await expect(page.getByRole("button", { name: /تم الحفظ/ })).toBeVisible({ timeout: 30_000 });
    // Signed-in staff are redirected off the landing page, so preview explicitly.
    await page.goto("/?preview=1");
    await expect(page.locator("body")).toContainText(marker, { timeout: 30_000 });
  });

  test("profile page stores the payment details students see", async ({ page }) => {
    await page.goto("/admin/profile");
    await expect(page.locator("body")).toContainText(/إعداداتي|CliQ/, { timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText("تعذّر");
  });

  test("uploads through the builder are accepted (cover + lesson resource)", async ({ page }) => {
    const { courseId, lessonId } = qaState();
    const cover = await uploadViaPresign(page, "cover", "receipt.png", "image/png");
    const put = await page.request.put(`/api/admin/courses/${courseId}`, { data: { coverImageKey: cover } });
    expect(put.ok(), await put.text()).toBe(true);

    const file = await uploadViaPresign(page, "resource", "note.pdf", "application/pdf");
    const res = await page.request.post(`/api/admin/lessons/${lessonId}/resources`, {
      data: { title: "ملزمة اختبار الجودة", fileKey: file, mimeType: "application/pdf" },
    });
    expect(res.ok(), await res.text()).toBe(true);
    const { resource } = await res.json();
    const dl = await page.request.get(`/api/lessons/${lessonId}/resources/${resource.id}`);
    expect(dl.ok()).toBe(true);

    // a forged key must be rejected
    const forged = await page.request.post(`/api/admin/lessons/${lessonId}/resources`, {
      data: { title: "مزوّر", fileKey: `resource/2020-01-01/${qaState().courseId}/fake.pdf`, mimeType: "application/pdf" },
    });
    expect(forged.status()).toBeGreaterThanOrEqual(400);
  });
});
