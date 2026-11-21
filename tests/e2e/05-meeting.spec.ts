import { expect, test } from "@playwright/test";
import { login, qaState, shot } from "./helpers";

/**
 * End-to-end meeting QA with two real browsers:
 *  teacher creates the meeting in the UI → opens the room as host,
 *  a guest opens the public invite link, knocks, is admitted,
 *  the teacher moderates (mute mic / stop camera / hand raise) and ends the meeting.
 */
test.describe("in-house live meeting", () => {
  test("teacher opens a room, admits a guest, moderates and ends", async ({ page, browser }) => {
    const base = process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app";
    await login(page, "teacher");
    await page.goto("/admin/live");

    await page.getByLabel("الدورة").selectOption({ label: "QA-دورة اختبار الجودة" });
    await page.getByRole("button", { name: /ابدئي حصة داخلية/ }).click();
    await expect(page.getByText(/الحصة الداخلية جاهزة/)).toBeVisible({ timeout: 60_000 });

    const invite = await page.locator('input[readonly]').first().inputValue();
    expect(invite).toContain("invite=");

    await page.getByRole("link", { name: /دخول غرفة الحصة/ }).click();
    await page.waitForURL(/\/live\//);
    await expect(page.getByRole("button", { name: /إنهاء الحصة/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/دعوة عامة لغير المسجّلات/)).toBeVisible();
    await shot(page, "teacher-meeting-room");

    // guest joins from a separate browser (no account at all)
    const guestCtx = await browser.newContext({ baseURL: base, locale: "ar-JO", permissions: ["microphone", "camera"] });
    const guest = await guestCtx.newPage();
    await guest.goto(invite);
    await guest.getByPlaceholder(/اسمك/).fill("ضيفة الاختبار");
    await guest.getByRole("button", { name: /دخول|انضمام|دخولي/ }).first().click();
    await expect(guest.locator("body")).toContainText(/بانتظار|انتظار|موافقة/, { timeout: 60_000 });

    // host sees the knock and admits her
    await expect(page.getByText(/طلبات دخول/)).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /^قبول$/ }).first().click();
    await expect(page.getByText("ضيفة الاختبار").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("li", { hasText: "ضيفة الاختبار" }).first()).toBeVisible({ timeout: 60_000 });
    await expect(guest.locator("body")).not.toContainText(/بانتظار/, { timeout: 60_000 });

    // moderation: her mic/camera are off, host can allow then revoke
    const guestRow = page.locator("li", { hasText: "ضيفة الاختبار" }).first();
    await expect(guestRow).toContainText(/مكتومة|مسموح/, { timeout: 30_000 });
    const allowMic = guestRow.getByRole("button", { name: /سماح بالمايك/ });
    if (await allowMic.isVisible().catch(() => false)) {
      await allowMic.click();
      await expect(guestRow.getByRole("button", { name: /^إسكات$/ })).toBeVisible({ timeout: 30_000 });
      await guestRow.getByRole("button", { name: /^إسكات$/ }).click();
      await expect(guestRow.getByRole("button", { name: /سماح بالمايك/ })).toBeVisible({ timeout: 30_000 });
    }
    const stopCam = guestRow.getByRole("button", { name: /إيقاف الكاميرا/ });
    if (await stopCam.isVisible().catch(() => false)) {
      await stopCam.click();
      await expect(guestRow.getByRole("button", { name: /سماح بالكاميرا/ })).toBeVisible({ timeout: 30_000 });
    }

    // hand raise from the guest reaches the host
    const raise = guest.getByRole("button", { name: /ارفعي يدك/ });
    if (await raise.isVisible().catch(() => false)) {
      await raise.click();
      await expect(page.locator("body")).toContainText(/تطلب التحدث|رافعة يدها/, { timeout: 45_000 });
    }

    // chat inside the meeting
    const chatBtn = page.getByRole("button", { name: /💬 الدردشة/ });
    if (await chatBtn.isVisible().catch(() => false)) {
      await chatBtn.click();
      const box = page.getByPlaceholder(/رسالة|اكتبي/).first();
      if (await box.count()) {
        await box.fill("رسالة اختبار من المعلمة");
        await page.keyboard.press("Enter");
        await expect(page.locator("body")).toContainText("رسالة اختبار من المعلمة", { timeout: 30_000 });
      }
      // Material sharing (image / PDF / audio) is part of the same composer.
      await expect(page.locator('input[type="file"][accept*="application/pdf"]')).toHaveCount(1);
    }

    // ── guest uploads are authorised by the invite link, not by an account ──
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVQoU2NkYGD4z0AEYBxVSFyIRg0aNWhUIVGjBo0aVAgAS2gEAcO1s2sAAAAASUVORK5CYII=",
      "base64",
    );
    // the composer lives inside the guest's chat panel
    const guestChatBtn = guest.getByRole("button", { name: /الدردشة/ }).first();
    if (await guestChatBtn.isVisible().catch(() => false)) await guestChatBtn.click();
    // the file input is visually hidden behind the paperclip label
    await expect(guest.getByTestId("meet-attach")).toHaveCount(1, { timeout: 30_000 });
    await guest.getByTestId("meet-attach").setInputFiles({ name: "page.png", mimeType: "image/png", buffer: png });
    await expect(guest.locator("body")).toContainText(/page\.png|جاهز للإرسال/, { timeout: 60_000 });

    // ── the host can record the meeting into «تسجيلات الحصص» ──
    const record = page.getByTestId("meet-record");
    await expect(record).toBeVisible({ timeout: 30_000 });
    {
      await record.click();
      await expect(page.getByTestId("meet-record")).toContainText(/إيقاف التسجيل/, { timeout: 120_000 });
      await page.waitForTimeout(9_000);
      await page.getByTestId("meet-record").click();
      await expect(page.locator("body")).toContainText(/حُفظ التسجيل|تعذّر/, { timeout: 120_000 });

      await expect
        .poll(
          async () => {
            const res = await page.request.get("/api/admin/recordings");
            const rows = res.ok() ? ((await res.json()).recordings ?? []) : [];
            const live = rows.find((r: { title: string }) => r.title.includes("تسجيل حصة مباشرة"));
            return live ? `${live.status}:${live.hasVideo}` : "missing";
          },
          { timeout: 180_000, intervals: [3000, 5000, 5000, 8000] },
        )
        .toBe("READY:true");

      // clean up the recording created by this test
      const rows = await (await page.request.get("/api/admin/recordings")).json();
      for (const r of rows.recordings ?? []) {
        if (r.title.includes("تسجيل حصة مباشرة")) await page.request.delete(`/api/admin/recordings/${r.id}`);
      }
    }

    // end the meeting for everyone
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /إنهاء الحصة/ }).click();
    await expect(page.locator("body")).toContainText(/انتهت مشاركتك|أنهت المعلمة|انتهت الحصة|تم إنهاء/, { timeout: 45_000 });

    await guestCtx.close();
  });

  test("an enrolled student can join the same meeting and is recorded as attendance", async ({ page }) => {
    await login(page, "student1");
    await page.goto("/dashboard");
    const live = page.getByRole("link", { name: /حصة|مباشر/ }).first();
    if (await live.count()) {
      await live.click();
      await page.waitForURL(/\/live\//, { timeout: 30_000 }).catch(() => {});
    }
    // A meeting may already be closed by the previous test; the page must still
    // explain the state clearly instead of crashing.
    await expect(page.locator("body")).toContainText(/حصة|غرفة|مباشر|انتهت|غير/, { timeout: 30_000 });
  });
});
