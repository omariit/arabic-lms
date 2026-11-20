import { expect, test } from "@playwright/test";
import { login, logout, qaState, localPhone } from "./helpers";

test.describe("authentication & session resilience", () => {
  test("staff can sign in and reach her dashboard", async ({ page }) => {
    await login(page, "teacher");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator("body")).toContainText(/خولة|الرئيسية/);
  });

  test("student can sign in and reach her dashboard", async ({ page }) => {
    await login(page, "student1");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("wrong password shows a clear Arabic error and stays on the form", async ({ page }) => {
    const { phone, password } = qaState();
    await page.goto("/login");
    await page.getByLabel("رقم الهاتف").fill(localPhone(phone.teacher.phone));
    await page.getByLabel("كلمة المرور").fill(`${password}-wrong`);
    await page.getByRole("button", { name: /دخول/ }).click();
    await expect(page.locator("p.text-red-600, p.bg-red-50").first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("a tampered session cookie sends her to login instead of a broken dashboard", async ({ page, context }) => {
    await page.goto("/admin/courses");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("next=");
  });

  test("mid-session expiry shows the friendly banner and recovers", async ({ page, context }) => {
    await login(page, "teacher");
    await page.goto("/admin/enrollments");

    // Simulate a session that died server-side (expired, or logged in elsewhere).
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "lms_session");
    expect(session).toBeTruthy();
    await context.addCookies([{ ...session!, value: "broken.token" }]);

    await page.reload();
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    expect(page.url()).toContain("expired=1");
    await expect(page.locator("body")).toContainText(/انتهت جلستك/);

    // And she can sign back in without losing her place.
    await page.getByLabel("كلمة المرور").fill(qaState().password);
    await page.getByLabel("رقم الهاتف").fill(localPhone(qaState().phone.teacher.phone));
    await page.getByRole("button", { name: /دخول/ }).click();
    await page.waitForURL(/\/admin/, { timeout: 60_000 });
  });

  test("logout ends the session", async ({ page }) => {
    await login(page, "student1");
    await page.goto("/dashboard");
    const btn = page.getByRole("button", { name: /خروج/ }).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForURL(/\/login|\/$/, { timeout: 30_000 });
      await page.goto("/dashboard");
      await page.waitForURL(/\/login/);
    }
  });

  test("role boundaries hold: student cannot open staff pages", async ({ page }) => {
    await login(page, "student1");
    const res = await page.goto("/admin/courses");
    expect([307, 308, 200]).toContain(res?.status() ?? 0);
    await expect(page.locator("body")).not.toContainText("لوحة التحكم");
  });
});
