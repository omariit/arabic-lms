import { chromium, devices } from "@playwright/test";

/**
 * Real-browser login matrix (mobile viewport) against a given base URL.
 * Prints the visible error text on failure so nothing is guesswork.
 *
 *   VERIFY_BASE=https://arabic-lms-production.up.railway.app node scripts/check-login-ui.mjs
 */
const BASE = process.env.VERIFY_BASE || "https://arabic-lms-production.up.railway.app";
const cases = (process.env.VERIFY_CASES || "admin:0787262186:Admin-Muqriaa-4826,teacher:0785054355:Teacher-Khawla-7731")
  .split(",")
  .map((c) => {
    const [label, phone, ...rest] = c.split(":");
    return { label, phone, password: rest.join(":"), home: label.startsWith("student") ? "/dashboard" : "/admin" };
  });

const browser = await chromium.launch();
for (const c of cases) {
  const ctx = await browser.newContext({ ...devices["iPhone 12"], baseURL: BASE, locale: "ar-JO" });
  const page = await ctx.newPage();
  const net = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/auth")) net.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.goto("/login", { waitUntil: "networkidle" });
  const banner = await page.getByText(/بيئة تجريبية/).isVisible().catch(() => false);
  await page.getByLabel("رقم الهاتف").fill(c.phone);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(c.password);
  await page.getByRole("button", { name: /^(دخول|…)$/ }).click();
  const ok = await page.waitForURL(new RegExp(c.home), { timeout: 60000 }).then(() => true).catch(() => false);
  const heading = ok ? (await page.locator("h1, h2").first().innerText().catch(() => "")).trim() : "";
  const errorText = ok ? "" : (await page.locator("p.bg-red-50, p.text-red-600").first().innerText().catch(() => "")).trim();
  console.log(
    `${c.label} (${c.phone}) → ${ok ? "OK" : "FAIL"} ${ok ? heading : errorText || page.url()} | ${net.join(", ")}${banner ? " | staging banner" : ""}`,
  );
  await ctx.close();
}
await browser.close();
