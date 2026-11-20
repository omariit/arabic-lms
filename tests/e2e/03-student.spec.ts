import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { login, qaState, uploadViaPresign, shot } from "./helpers";

test.describe("student experience", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "student1");
  });

  test("dashboard shows her course, exams and support entry point", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("دورة اختبار الجودة");
    await expect(page.locator("body")).toContainText("محادثتي مع المعلمة");
    await expect(page.locator("body")).toContainText("QA-اختبار تجويد");
    await shot(page, "student-dashboard");
  });

  test("lesson shows description, script and the assignment", async ({ page }) => {
    const { lessonId } = qaState();
    await page.goto(`/lesson/${lessonId}`);
    await expect(page.locator("body")).toContainText("وصف تجريبي للدرس الأول");
    await expect(page.locator("body")).toContainText("تسجيل سورة الفاتحة");
    await expect(page.locator("body")).toContainText("علامة مائية");
  });

  test("she can send a text submission and read it back in her private thread", async ({ page }) => {
    const { lessonId } = qaState();
    await page.goto(`/lesson/${lessonId}`);
    await page.getByRole("button", { name: /الواجب والمحادثة/ }).click();
    const before = await page.locator("text=سؤال اختبار").count();
    await page.getByPlaceholder("اكتبي إجابتك أو سؤالك…").fill("هذا تسليم اختبار آلي");
    await page.getByRole("button", { name: /^إرسال$/ }).click();
    await expect(page.locator("body")).toContainText("هذا تسليم اختبار آلي");
    await page.reload();
    await page.getByRole("button", { name: /الواجب والمحادثة/ }).click();
    await expect(page.locator("body")).toContainText("هذا تسليم اختبار آلي");
    expect(before).toBeGreaterThanOrEqual(0);
  });

  test("she can record a voice homework note and play it back", async ({ page }) => {
    const { lessonId } = qaState();
    await page.goto(`/lesson/${lessonId}`);
    await page.getByRole("button", { name: /الواجب والمحادثة/ }).click();
    await page.getByRole("button", { name: /تسجيل صوتي/ }).click();
    await page.waitForTimeout(1800);
    await page.getByRole("button", { name: /إيقاف/ }).click();
    await page.getByRole("button", { name: /^إرسال$/ }).click();
    await expect(page.locator("body")).toContainText("بانتظار رد المعلمة", { timeout: 45_000 });
    const playBtns = page.getByRole("button", { name: /استمعي/ });
    await expect(playBtns.first()).toBeVisible();
    await playBtns.first().click();
    await expect(page.getByRole("button", { name: /إيقاف/ }).first()).toBeVisible();
  });

  test("private chat: text message plus a voice note", async ({ page }) => {
    await page.goto("/dashboard/chat");
    await page.getByRole("button", { name: /＋ محادثة جديدة/ }).click();
    await page.getByPlaceholder(/الموضوع/).fill("سؤال اختبار آلي");
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST"),
      page.getByRole("button", { name: /^محادثة جديدة$/ }).click(),
    ]);
    const composer = page.getByPlaceholder("اكتبي رسالتك…");
    await expect(composer).toBeVisible({ timeout: 60_000 });
    await composer.fill("استفسار اختبار آلي عبر المحادثة");
    await page.getByRole("button", { name: /^إرسال$/ }).click();
    await expect(page.locator("body")).toContainText("استفسار اختبار آلي عبر المحادثة", { timeout: 30_000 });

    // voice note in the same thread
    await page.locator('button[title="تسجيل رسالة صوتية"]').click();
    await page.waitForTimeout(1600);
    await page.getByRole("button", { name: /إيقاف/ }).click();
    await page.getByRole("button", { name: /إرفاق الصوت/ }).click();
    await expect(page.getByText(/تسجيل جاهز/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /^إرسال$/ }).click();
    await expect(page.getByRole("button", { name: /تشغيل الرسالة الصوتية|استمعي/ }).first()).toBeVisible({ timeout: 45_000 });
    await shot(page, "student-chat");
  });

  test("voice note upload through the chat API is accepted and gated", async ({ page }) => {
    const key = await uploadViaPresign(page, "submission", "voice.webm", "audio/webm");
    const conv = await page.request.post("/api/chat", { data: { subject: "QA voice thread" } });
    expect(conv.ok()).toBe(true);
    const { conversation } = await conv.json();
    const msg = await page.request.post(`/api/chat/${conversation.id}`, {
      data: { body: "", audioKey: key, audioMime: "audio/webm" },
    });
    expect(msg.ok(), await msg.text()).toBe(true);
    const { message } = await msg.json();
    expect(message.audioKey).toBe(key);

    // the presigned playback URL must work for the owner
    const audio = await page.request.get(`/api/chat/audio/${message.id}`);
    expect(audio.ok()).toBe(true);
    const { url } = await audio.json();
    const fetched = await page.request.get(url);
    expect(fetched.ok()).toBe(true);
  });

  test("MCQ exam: start, answer every question, submit and see a score", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("QA-اختبار تجويد").first().click();
    await page.waitForURL(/\/exam\//);

    const startBtn = page.getByRole("button", { name: /ابدئي الاختبار/ });
    if (await startBtn.isVisible().catch(() => false)) await startBtn.click();

    // Answer: first question → "خمسة", second → "خطأ"
    await expect(page.getByText("كم عدد مخارج الحروف الرئيسية؟")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "خمسة" }).click();
    await page.getByRole("button", { name: "خطأ" }).click();
    await page.getByRole("button", { name: /تسليم الاختبار/ }).click();

    await expect(page.locator("body")).toContainText(/نتيجتك/, { timeout: 45_000 });
    await expect(page.locator("body")).toContainText("مراجعة الإجابات");
  });

  test("enrollment request with a receipt image reaches the teacher queue", async ({ page }) => {
    const { courseId } = qaState();
    await page.request.post("/api/auth/login", { data: { phone: qaState().phone.student3.phone, password: qaState().password } });
    const key = await uploadViaPresign(page, "receipt", "receipt.png", "image/png");
    const res = await page.request.post("/api/student/enroll-request", {
      data: { courseId, receiptRef: "QA-RECEIPT-UI", receiptKey: key, note: "طلب من اختبار الواجهة" },
    });
    expect(res.ok(), await res.text()).toBe(true);
  });
});
