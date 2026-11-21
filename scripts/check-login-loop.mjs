/**
 * Regression guard for ERR_TOO_MANY_REDIRECTS on /login.
 *
 * A well-formed cookie whose session was revoked (logged out elsewhere, or a
 * session killed by single-device enforcement) used to loop:
 *   GET /login → 307 /dashboard → 307 /login → …
 *
 * Expected after the fix:
 *   /login with a stale but well-formed cookie  → 200 (form)
 *   /dashboard with the same cookie             → 307 → /login
 *   /login again                                → 200, no loop
 */
const BASE = process.env.VERIFY_BASE || "https://arabic-lms-staging.up.railway.app";
const PHONE = process.env.VERIFY_PHONE || "0790000002";
const PASSWORD = process.env.VERIFY_PASSWORD || "qa-pass-2026";

const jar = { cookie: "" };

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    redirect: "manual",
    headers: { ...(opts.headers || {}), ...(jar.cookie ? { cookie: jar.cookie } : {}) },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(";");
    const [name] = pair.split("=");
    if (name === "lms_session") jar.cookie = pair;
  }
  return { status: res.status, location: res.headers.get("location"), res };
}

const login = await req("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ phone: PHONE, password: PASSWORD, countryCode: "JO" }),
});
console.log(`login api → ${login.status} ${login.status === 200 ? "" : await login.res.text()}`);
if (!jar.cookie) {
  console.error("no session cookie received");
  process.exit(1);
}

// Revoke the session server-side while keeping the cookie in the "browser".
const out = await req("/api/auth/logout", { method: "POST" });
console.log(`logout → ${out.status} (cookie kept on purpose)`);

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const a = await req("/login");
check("/login with a revoked session cookie → 200 (not a redirect)", a.status === 200, `got ${a.status} ${a.location ?? ""}`);

const b = await req("/dashboard");
check("/dashboard with a revoked session cookie → redirect to /login", b.status === 307 && /\/login/.test(b.location ?? ""), `got ${b.status} ${b.location ?? ""}`);

const c = await req(b.location ?? "/login");
check("following that redirect lands on a 200 page", c.status === 200, `got ${c.status} ${c.location ?? ""}`);

// Simulate a browser chasing redirects: must terminate.
let url = "/login";
let hops = 0;
while (hops < 12) {
  const r = await req(url);
  hops++;
  if (r.status === 200) break;
  if (![307, 308, 302, 303].includes(r.status) || !r.location) break;
  url = new URL(r.location, BASE).pathname + new URL(r.location, BASE).search;
}
check("redirect chain from /login terminates in ≤ 3 hops", hops <= 3, `${hops} hop(s): ${url}`);

console.log(failures === 0 ? "\nALL OK — no redirect loop" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
