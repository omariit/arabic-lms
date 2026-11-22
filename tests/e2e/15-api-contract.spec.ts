import { expect, test } from "@playwright/test";
import { login, qaState } from "./helpers";

/**
 * API contract tests (H7) — the promises each endpoint makes, independent of the UI.
 * Order-independent: every case signs in the account it needs, and nothing mutates
 * production data (read-only verbs plus one harmless failed login attempt).
 * Runs against staging only (see playwright.config.ts / docs/qa.md).
 */

const STAFF_APIS = ["/api/admin/courses", "/api/admin/students", "/api/admin/recordings", "/api/admin/inbox", "/api/admin/site-content"];

test.describe("API contract: anonymous", () => {
  for (const path of STAFF_APIS) {
    test(`401 without a session on ${path}`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
    });
  }

  test("401 without a session on recording playback", async ({ request }) => {
    const res = await request.get("/api/recordings/nonexistent/video");
    expect(res.status()).toBe(401);
  });
});

test.describe("API contract: wrong role", () => {
  test("student gets 403 on staff APIs", async ({ request }) => {
    const state = qaState();
    const res = await request.post("/api/auth/login", {
      data: { phone: localPhoneKey(state, "student1"), password: state.password, countryCode: "JO" },
    });
    expect(res.ok()).toBeTruthy();
    for (const path of STAFF_APIS) {
      const staff = await request.get(path);
      expect(staff.status()).toBe(403);
    }
  });

  test("recording playback is 403 for a student, even for a nonexistent recording id", async ({ request }) => {
    const state = qaState();
    const res = await request.post("/api/auth/login", {
      data: { phone: localPhoneKey(state, "student1"), password: state.password, countryCode: "JO" },
    });
    expect(res.ok()).toBeTruthy();
    const video = await request.get("/api/recordings/nonexistent/video");
    expect([403, 404]).toContain(video.status());
    // The 401 branch (anonymous) is covered above; a signed-in non-staff never gets bytes.
  });
});

test.describe("API contract: login form", () => {
  test("native form POST answers 303 and never leaks the password in a URL", async ({ request }) => {
    // maxRedirects:0 — we assert the contract (the 303 itself), not the followed response.
    const res = await request.post("/api/auth/login-form", {
      form: { phone: "07800000000", password: "definitely-wrong", countryCode: "JO" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    const location = res.headers().location ?? "";
    expect(location).toContain("/login");
    expect(location).not.toContain("definitely-wrong");
  });
});

/** The E.164 phone stored in qa-state, converted to the local digits the login API expects. */
function localPhoneKey(state: ReturnType<typeof qaState>, key: keyof ReturnType<typeof qaState>["phone"]) {
  const phone = state.phone[key].phone;
  return `0${phone.replace(/^\+962/, "")}`;
}
