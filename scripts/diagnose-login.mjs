import { chromium, devices } from "@playwright/test";

/** Diagnose the login page as a real visitor would see it (fresh profile, no cache). */
const BASE = process.env.VERIFY_BASE || "https://arabic-lms-production.up.railway.app";
const UA = process.env.VERIFY_UA || "";

const browser = await chromium.launch();
for (const dev of ["iPhone 12", "Desktop Chrome"]) {
  const ctx = await browser.newContext({
    ...(dev === "iPhone 12" ? devices[dev] : {}),
    baseURL: BASE,
    locale: "ar-JO",
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(`console.${m.type()}: ${m.text().slice(0, 200)}`));
  page.on("pageerror", (e) => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("requestfailed", (r) => logs.push(`reqfail: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
  page.on("response", (r) => {
    if (r.status() >= 400) logs.push(`http ${r.status()} ${new URL(r.url()).pathname}`);
  });

  const res = await page.goto("/login", { waitUntil: "networkidle" }).catch((e) => e);
  const status = res && "status" in res ? res.status() : "ERR";
  await page.waitForTimeout(1500);
  const hasPhone = await page.getByLabel("رقم الهاتف", { exact: true }).isVisible().catch(() => false);
  const hasSubmit = await page.getByRole("button", { name: /^(دخول|…)$/ }).isVisible().catch(() => false);
  const bodyText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
  console.log(`\n[${dev}] status=${status} phoneField=${hasPhone} submit=${hasSubmit}`);
  console.log(`  body: ${bodyText}`);
  if (logs.length) console.log(`  logs:\n   - ${logs.slice(0, 8).join("\n   - ")}`);
  await page.screenshot({ path: `C:/Users/JCC/AppData/Local/Temp/login-${dev.replace(/\s+/g, "-")}.png` });
  await ctx.close();
}
await browser.close();
