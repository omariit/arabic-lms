import { chromium, devices } from "@playwright/test";

/**
 * Proves the login page works in three hostile conditions:
 *  1. normal (JS enabled)
 *  2. JavaScript disabled / never hydrated  → native form POST
 *  3. wrong credentials → readable ?error= redirect
 */
const BASE = process.env.VERIFY_BASE || "https://arabic-lms-production.up.railway.app";
const PHONE = process.env.VERIFY_PHONE || "0787262186";
const PASSWORD = process.env.VERIFY_PASSWORD || "";

if (!PASSWORD) {
  console.error("set VERIFY_PASSWORD");
  process.exit(1);
}

const browser = await chromium.launch();

// 1) normal
{
  const ctx = await browser.newContext({ ...devices["iPhone 12"], baseURL: BASE, locale: "ar-JO" });
  const page = await ctx.newPage();
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("رقم الهاتف", { exact: true }).fill(PHONE);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  const ok = await page.waitForURL(/\/admin/, { timeout: 60000 }).then(() => true).catch(() => false);
  console.log(`1. normal browser: ${ok ? "OK" : "FAIL " + page.url()}`);
  await ctx.close();
}

// 2) JavaScript disabled — the form must still sign in
{
  const ctx = await browser.newContext({ ...devices["iPhone 12"], baseURL: BASE, locale: "ar-JO", javaScriptEnabled: false });
  const page = await ctx.newPage();
  const res = await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("رقم الهاتف", { exact: true }).fill(PHONE);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);
  await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.getByRole("button", { name: "دخول" }).click()]);
  const ok = /\/admin/.test(page.url());
  const body = ok ? (await page.locator("h1, h2").first().innerText().catch(() => "")).trim() : "";
  console.log(`2. no JavaScript: ${ok ? "OK → " + body : "FAIL → " + page.url()} (after ${res?.status()})`);
  await ctx.close();
}

// 3) wrong password → readable error after redirect
{
  const ctx = await browser.newContext({ ...devices["iPhone 12"], baseURL: BASE, locale: "ar-JO", javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("رقم الهاتف", { exact: true }).fill(PHONE);
  await page.getByLabel("كلمة المرور", { exact: true }).fill("definitely-wrong");
  await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.getByRole("button", { name: "دخول" }).click()]);
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const shown = /كلمة المرور غير صحيحة|لا يوجد حساب|توقّف مؤقت/.test(text);
  console.log(`3. wrong password (no JS): ${shown ? "OK → error message shown" : "FAIL → " + page.url()}`);
  console.log(`   url: ${page.url()}`);
  await ctx.close();
}

await browser.close();
