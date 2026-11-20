import { expect, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export type QaState = {
  courseId: string;
  lessonId: string;
  password: string;
  phone: Record<string, { phone: string; name: string; role: string }>;
};

const statePath = path.join(__dirname, ".qa-state.json");

export function qaState(): QaState {
  if (!fs.existsSync(statePath)) throw new Error("Run `node prisma/seed-qa.mjs` against staging first");
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as QaState;
}

/** Phone as the login form wants it (local digits, no country code). */
export function localPhone(e164: string) {
  return `0${e164.replace(/^\+962/, "")}`;
}

/** Sign in through the real form (no cookie injection) and land on the app. */
export async function login(page: Page, key: keyof QaState["phone"]) {
  const state = qaState();
  const acc = state.phone[key];

  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto("/login");
    await page.getByLabel("رقم الهاتف").fill(localPhone(acc.phone));
    await page.getByLabel("كلمة المرور").fill(state.password);

    const loginResponse = page
      .waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST", { timeout: 90_000 })
      .catch(() => null);
    await page.getByRole("button", { name: /دخول/ }).click();

    const ok = await page
      .waitForURL(/\/(admin|dashboard)/, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    if (ok) return;

    // 429 = too many attempts from this IP for this number: wait out the window.
    const res = await loginResponse;
    if (res?.status() === 429 || (await page.getByText(/محاولات كثيرة/).isVisible().catch(() => false))) {
      await page.waitForTimeout(35_000);
      continue;
    }
    // Cold start / network blip: one more go before failing loudly.
    if (attempt < 2) {
      await page.waitForTimeout(2500);
      continue;
    }
    const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`login failed for ${key} (status ${res?.status() ?? "?"}): still at ${page.url()} — page says: ${text}`);
  }
  throw new Error(`login failed for ${key}: still at ${page.url()}`);
}

export async function logout(page: Page) {
  const btn = page.getByRole("button", { name: /خروج/ }).first();
  if (await btn.count()) await btn.click();
  await page.waitForURL(/\/login|\/$/, { timeout: 30_000 }).catch(() => {});
}

/**
 * Media/API GET that tolerates Railway's edge dropping a TLS record when a video
 * stream is aborted mid-flight. Tests must fail on authorization, not on a
 * transient socket error.
 */
export async function getWithRetry(
  request: APIRequestContext,
  url: string,
  options: { headers?: Record<string, string>; maxRedirects?: number } = {},
  attempts = 4,
) {
  let last: Awaited<ReturnType<APIRequestContext["get"]>> | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      last = await request.get(url, options);
      if (last.status() < 500) return last;
    } catch {
      /* transport-level failure — retry */
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (!last) throw new Error(`request failed after ${attempts} attempts: ${url}`);
  return last;
}

/** Direct R2 upload through the app's own presign endpoint (same path the UI uses). */
export async function uploadViaPresign(page: Page, kind: string, file: string, mimeType: string) {
  const res = await page.request.post("/api/r2/upload", { data: { kind, mimeType } });
  expect(res.ok(), `presign ${kind} failed: ${res.status()}`).toBe(true);
  const { uploadUrl, key } = (await res.json()) as { uploadUrl: string; key: string };
  const put = await page.request.put(uploadUrl, {
    data: fs.readFileSync(path.join(__dirname, "fixtures", file)),
    headers: { "Content-Type": mimeType },
  });
  expect(put.ok(), `R2 PUT failed: ${put.status()}`).toBe(true);
  return key as string;
}

export async function isVisible(page: Page, text: string | RegExp, timeout = 8000) {
  return page
    .getByText(text)
    .first()
    .isVisible({ timeout })
    .catch(() => false);
}

export const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: path.join(__dirname, "..", "..", "qa-report", "shots", `${name}.png`), fullPage: true });
};
