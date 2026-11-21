import { describe, expect, it } from "vitest";
import { normalizePhoneInput, passwordCandidates, toAsciiDigits } from "@/lib/login-input";
import { normalizePhone } from "@/lib/phone";

describe("toAsciiDigits", () => {
  it("converts Arabic-Indic and Persian digits", () => {
    expect(toAsciiDigits("٠٧٨٧٢٦٢١٨٦")).toBe("0787262186");
    expect(toAsciiDigits("۰۱۲۳۴۵")).toBe("012345");
  });
});

describe("normalizePhoneInput", () => {
  it("strips separators a phone keyboard may insert", () => {
    expect(normalizePhoneInput("078 726 2186")).toBe("0787262186");
    expect(normalizePhoneInput("(078) 726-2186")).toBe("0787262186");
    expect(normalizePhoneInput("+962 78 505 4355")).toBe("+962785054355");
    expect(normalizePhoneInput("٠٧٨٧٢٦٢١٨٦")).toBe("0787262186");
  });

  it("feeds the existing normalizer to the stored E.164", () => {
    const normalized = normalizePhone(normalizePhoneInput("٠٧٨٧٢٦٢١٨٦"), "JO");
    expect(normalized.ok && normalized.e164).toBe("+962787262186");
    const intl = normalizePhone(normalizePhoneInput("+962 787 262 186"), "JO");
    expect(intl.ok && intl.e164).toBe("+962787262186");
  });
});

describe("passwordCandidates", () => {
  it("tries the raw value first and never drops it", () => {
    const [first] = passwordCandidates("Teacher-Khawla-7731");
    expect(first).toBe("Teacher-Khawla-7731");
  });

  it("recovers from smart punctuation, NBSP and trailing spaces", () => {
    const candidates = passwordCandidates("Admin–Muqriaa–4826 ");
    expect(candidates).toContain("Admin-Muqriaa-4826");
  });

  it("recovers from Arabic-Indic digits in the password", () => {
    expect(passwordCandidates("Admin-Muqriaa-٤٨٢٦")).toContain("Admin-Muqriaa-4826");
  });
});
