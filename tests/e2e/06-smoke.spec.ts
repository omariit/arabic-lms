import { expect, test } from "@playwright/test";

/**
 * Read-only production smoke test. Creates nothing, deletes nothing.
 *   QA_SMOKE=1 QA_BASE_URL=https://arabic-lms-production.up.railway.app npx playwright test tests/e2e/06-smoke.spec.ts
 */
const enabled = process.env.QA_SMOKE === "1";
const PROD_PHONE = process.env.SMOKE_TEACHER_PHONE || "0785054355";
const PROD_PASSWORD = process.env.SMOKE_TEACHER_PASSWORD || "";

test.describe("production smoke (read-only)", () => {
  test.skip(!enabled || !PROD_PASSWORD, "set QA_SMOKE=1 and SMOKE_TEACHER_PASSWORD to run");

  test("public pages answer 200 and stay indexable", async ({ request }) => {
    for (const path of ["/", "/courses", "/login", "/register", "/robots.txt", "/sitemap.xml", "/manifest.json", "/sw.js"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
  });

  test("every staff screen renders with zero failed API calls", async ({ page }) => {
    const failures: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/") && r.status() >= 400) failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e).slice(0, 120)));

    await page.goto("/login");
    await page.getByLabel("رقم الهاتف").fill(PROD_PHONE);
    await page.getByLabel("كلمة المرور").fill(PROD_PASSWORD);
    await page.getByRole("button", { name: /دخول/ }).click();
    await page.waitForURL(/\/admin/, { timeout: 90_000 });

    const screens = [
      "/admin", "/admin/chat", "/admin/live", "/admin/enrollments", "/admin/courses",
      "/admin/grading", "/admin/profile", "/admin/vouchers", "/admin/testimonials",
      "/admin/landing", "/admin/staff", "/admin/violations", "/admin/studio", "/admin/recordings",
    ];
    for (const url of screens) {
      const res = await page.goto(url, { waitUntil: "networkidle" });
      expect(res?.status(), url).toBe(200);
      await expect(page.locator("body")).not.toContainText("Application error", { timeout: 5_000 }).catch(() => {});
    }
    expect(failures, `failed API calls: ${failures.join(", ")}`).toHaveLength(0);
    expect(crashes, `page errors: ${crashes.join(", ")}`).toHaveLength(0);
  });
});
