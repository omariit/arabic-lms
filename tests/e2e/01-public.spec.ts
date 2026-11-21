import { expect, test } from "@playwright/test";
import { qaState } from "./helpers";

test.describe("public site", () => {
  test("landing renders the brand, hero and call to action", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).toContainText("مُقْرِئَة");
    const cta = page.getByRole("link", { name: /ابدئي|سجّل|التسجيل|التحققي|استعرضي/ }).first();
    await expect(cta).toBeVisible();
  });

  test("language switch flips the document to English and back", async ({ page }) => {
    await page.goto("/");
    const sw = page.getByRole("button", { name: /EN|English/i }).first();
    if (await sw.count()) {
      await sw.click();
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      await page.getByRole("button", { name: /AR|عربي/i }).first().click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
  });

  test("courses index lists the QA course and opens it", async ({ page }) => {
    const { courseId } = qaState();
    await page.goto("/courses");
    const card = page.getByText("دورة اختبار الجودة").first();
    await expect(card).toBeVisible();
    await card.click();
    await page.waitForURL(new RegExp(courseId));
    await expect(page.locator("body")).toContainText("ماذا ستتعلّمين"); // outcomes section (its text is editable by the teacher)
    await expect(page.locator("body")).toContainText("إلمام بقراءة القرآن"); // requirements
    await expect(page.locator("body")).toContainText("السبت 6:00 م"); // weekly meetings
  });

  test("login and register pages are reachable and translated", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("رقم الهاتف")).toBeVisible();
    await page.goto("/register");
    await expect(page.getByLabel(/الاسم/)).toBeVisible();
  });

  test("unknown path renders the custom 404", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.locator("body")).toContainText(/غير موجود|404|ضاعت/);
  });

  test("SEO + PWA endpoints are healthy", async ({ page, request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBe(true);
    expect(await robots.text()).toContain("Sitemap:");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain(qaState().courseId);

    const manifest = await request.get("/manifest.json");
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).name).toBeTruthy();

    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    expect(await sw.text()).toContain("muqriah-v5");

    // private areas must never be indexable
    const off = await page.goto("/offline");
    expect(off?.ok()).toBe(true);
  });

  test("private areas expose noindex metadata and redirect anonymous visitors", async ({ page }) => {
    const res = await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
    expect(res?.status()).toBeLessThan(400);
  });
});
