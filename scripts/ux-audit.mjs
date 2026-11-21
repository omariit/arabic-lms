/**
 * UI/UX audit on staging (never production): mobile + desktop.
 *
 * For every key screen it records real defects a teacher/student would feel:
 *   - horizontal scrolling (RTL layouts break easily)
 *   - tap targets smaller than 40px (she is on a phone, with one hand)
 *   - text below 11px (unreadable in Arabic)
 *   - images without alt text
 *   - console errors / failed requests / missing <h1>
 * and saves a screenshot per screen for a human look.
 *
 * Usage: VERIFY_BASE=https://… node scripts/ux-audit.mjs
 */
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.VERIFY_BASE || "https://arabic-lms-staging.up.railway.app";
const SHOTS = process.env.SHOTS_DIR || "C:/Users/JCC/AppData/Local/Temp/ux";
const state = JSON.parse(fs.readFileSync("tests/e2e/.qa-state.json", "utf8"));
const local = (p) => p.replace("+962", "0");

fs.mkdirSync(SHOTS, { recursive: true });

const SCREENS = {
  teacher: ["/admin", "/admin/inbox", "/admin/chat", "/admin/courses", "/admin/exams", "/admin/studio", "/admin/recordings", "/admin/live", "/admin/enrollments", "/admin/students", "/admin/grading", "/admin/profile", "/admin/landing"],
  student: ["/dashboard", "/courses", "/dashboard/chat"],
};

const findings = [];

async function audit(page, label, viewport) {
  const data = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - window.innerWidth;

    const smallText = [...document.querySelectorAll("p,span,a,button,label,li,td,h1,h2,h3,h4,div")]
      .filter((el) => {
        const t = (el.textContent || "").trim();
        if (!t || el.children.length > 0) return false;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        return fs > 0 && fs < 11;
      })
      .slice(0, 6)
      .map((el) => `${getComputedStyle(el).fontSize} «${(el.textContent || "").trim().slice(0, 24)}»`);

    const smallTargets = [...document.querySelectorAll("button,a[href],input[type=checkbox],[role=button]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return r.height < 40 && (el.textContent || "").trim().length > 0;
      })
      .slice(0, 6)
      .map((el) => `${Math.round(el.getBoundingClientRect().height)}px ${el.tagName}.${(el.className || "").toString().split(" ").slice(0, 3).join(".")} «${(el.textContent || "").trim().slice(0, 22)}»`);

    const noAlt = [...document.querySelectorAll("img")].filter((i) => !i.getAttribute("alt")).length;
    const h1 = document.querySelectorAll("h1").length;
    const body = (document.body.innerText || "").replace(/\s+/g, " ");

    return {
      overflow,
      smallText,
      smallTargets,
      noAlt,
      h1,
      hasError: /تعذّر|حدث خطأ|Application error|something went wrong/i.test(body),
      chars: body.length,
    };
  });

  findings.push({ screen: label, viewport, ...data });
  await page.screenshot({ path: path.join(SHOTS, `${label.replace(/[\/]/g, "_")}-${viewport}.png`), fullPage: false });
}

const browser = await chromium.launch();

async function session(role, phone, viewports) {
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      baseURL: BASE,
      locale: "ar-JO",
      ...(vp === "mobile" ? devices["iPhone 12"] : { viewport: { width: 1280, height: 900 } }),
    });
    const page = await ctx.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(`pageerror ${String(e).slice(0, 80)}`));
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (r.status() >= 400 && !u.pathname.startsWith("/_next")) problems.push(`${r.status()} ${u.pathname}`);
    });

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    if (await page.getByLabel("رقم الهاتف", { exact: true }).isVisible().catch(() => false)) {
      await page.getByLabel("رقم الهاتف", { exact: true }).fill(local(phone));
      await page.getByLabel("كلمة المرور", { exact: true }).fill(state.password);
      await page.getByRole("button", { name: "دخول" }).click();
      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 90_000 }).catch(() => {});
    }

    for (const route of SCREENS[role]) {
      await page.goto(route, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(700);
      await audit(page, route, vp);
      if (problems.length) {
        findings.push({ screen: route, viewport: vp, network: problems.splice(0, 4) });
      }
    }
    await ctx.close();
  }
}

await session("teacher", state.phone.teacher.phone, ["mobile", "desktop"]);
await session("student", state.phone.student1.phone, ["mobile", "desktop"]);
await browser.close();

const bad = findings.filter(
  (f) => f.overflow > 1 || (f.smallText?.length ?? 0) > 0 || (f.smallTargets?.length ?? 0) > 0 || f.noAlt > 0 || f.hasError || f.network,
);

console.log(`\n${findings.length} screen checks, ${bad.length} with findings\n`);
for (const f of findings) {
  const flags = [];
  if (f.overflow > 1) flags.push(`overflow +${f.overflow}px`);
  if (f.smallText?.length) flags.push(`tiny text: ${f.smallText.join(", ")}`);
  if (f.smallTargets?.length) flags.push(`small targets: ${f.smallTargets.join(", ")}`);
  if (f.noAlt) flags.push(`${f.noAlt} img without alt`);
  if (f.hasError) flags.push("error text visible");
  if (f.h1 === 0) flags.push("no h1");
  if (f.network) flags.push(`network: ${f.network.join(", ")}`);
  console.log(`${flags.length ? "⚠" : "✓"} ${f.viewport.padEnd(7)} ${f.screen.padEnd(24)} ${flags.join(" | ")}`);
}
console.log(`\nscreenshots: ${SHOTS}`);
