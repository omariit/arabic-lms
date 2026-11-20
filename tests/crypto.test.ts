import { describe, it, expect } from "vitest";

import {
  sign,
  safeEqual,
  encodeToken,
  decodeToken,
  fingerprintFrom,
  SESSION_TTL,
} from "@/lib/crypto";

describe("sign / safeEqual", () => {
  it("produces base64url HMAC that verifies", () => {
    const sig = sign("payload");
    expect(sig).not.toMatch(/[+/=]/); // base64url alphabet only
    expect(safeEqual(sig, sign("payload"))).toBe(true);
  });

  it("rejects tampered payload", () => {
    const sig = sign("payload");
    expect(safeEqual(sig, sign("payload2"))).toBe(false);
  });
});

describe("encodeToken / decodeToken", () => {
  it("round-trips payload and adds jti/iat/exp", () => {
    const token = encodeToken({ sid: "s1", uid: "u1" }, 60);
    const body = decodeToken<{ sid: string; uid: string; jti: string; exp: number }>(token)!;
    expect(body.sid).toBe("s1");
    expect(body.uid).toBe("u1");
    expect(body.jti).toMatch(/^[0-9a-f]{24}$/);
    expect(body.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a token signed with a different secret", () => {
    const token = encodeToken({ sid: "s1" }, 60);
    // Re-sign with different secret by stubbing env is not possible post-import,
    // so simulate tamper by altering the payload segment instead.
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sid: "evil" })).toString("base64url");
    expect(decodeToken(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = encodeToken({ sid: "s1" }, -1); // already expired
    expect(decodeToken(token)).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(decodeToken("")).toBeNull();
    expect(decodeToken("not-a-token")).toBeNull();
    expect(decodeToken("abc.def")).toBeNull();
    expect(decodeToken("a.b.c.d")).toBeNull();
  });

  it("session TTL is 14 days", () => {
    expect(SESSION_TTL).toBe(60 * 60 * 24 * 14);
  });
});

describe("fingerprintFrom", () => {
  const chromeWin =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const base = { userAgent: chromeWin, ip: "1.2.3.4", acceptLanguage: "ar", platform: "Android" };

  it("is deterministic for identical inputs", () => {
    expect(fingerprintFrom(base)).toBe(fingerprintFrom({ ...base }));
  });

  it("changes when the browser or OS family changes", () => {
    const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
    expect(fingerprintFrom(base)).not.toBe(fingerprintFrom({ ...base, userAgent: firefox }));
  });

  it("ignores browser version bumps (Chromium UA reduction)", () => {
    const newer = chromeWin.replace("131.", "132.");
    expect(fingerprintFrom(base)).toBe(fingerprintFrom({ ...base, userAgent: newer }));
  });

  it("ignores language, platform hints and IP — none of them may end a session", () => {
    expect(fingerprintFrom(base)).toBe(fingerprintFrom({ ...base, acceptLanguage: "en" }));
    expect(fingerprintFrom(base)).toBe(fingerprintFrom({ ...base, platform: "iOS" }));
    expect(fingerprintFrom(base)).toBe(fingerprintFrom({ ...base, ip: "5.6.7.8" }));
  });

  it("produces a 64-char hex digest (sha256)", () => {
    expect(fingerprintFrom(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("middleware-format compatibility", () => {
  // The edge middleware re-implements token verification with Web Crypto.
  // This test asserts the two implementations agree on the signature format.
  it("token produced by encodeToken verifies under the middleware's Web Crypto path", async () => {
    const token = encodeToken({ sid: "s1", uid: "u1" }, 60);
    const dot = token.lastIndexOf(".");
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode("test-secret-abcdef0123456789"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    expect(expected).toBe(sig);
  });
});
