/**
 * Country + phone normalization.
 *
 * Rules (learned from real Jordanian usage):
 *  - A user may type "0787262186" (local) with country key "00962" → +962787262186
 *    (drop the leading 0 of the national number).
 *  - Or "00962787262186" / "+962787262186" (already international) → use as-is.
 *  - Or national number without the 0: "787262186" + selected country → +962787262186.
 *  - USA numbers have no leading 0: "4155551234" + US → +14155551234.
 * Output: E.164 (+<dial><national>) for storage/login, and wa.me digits (no +)
 * for WhatsApp links.
 */

export type Country = {
  code: string; // ISO 3166 alpha-2
  dial: string; // international dial code without + or 00
  nameAr: string;
  nameEn: string;
  currency: string; // display currency for prices
};

export const COUNTRIES: Country[] = [
  { code: "JO", dial: "962", nameAr: "الأردن", nameEn: "Jordan", currency: "دينار" },
  { code: "PS", dial: "970", nameAr: "فلسطين", nameEn: "Palestine", currency: "شيكل" },
  { code: "SA", dial: "966", nameAr: "السعودية", nameEn: "Saudi Arabia", currency: "ريال" },
  { code: "US", dial: "1", nameAr: "الولايات المتحدة", nameEn: "United States", currency: "$" },
  { code: "AE", dial: "971", nameAr: "الإمارات", nameEn: "UAE", currency: "درهم" },
  { code: "KW", dial: "965", nameAr: "الكويت", nameEn: "Kuwait", currency: "دينار" },
  { code: "QA", dial: "974", nameAr: "قطر", nameEn: "Qatar", currency: "ريال" },
  { code: "BH", dial: "973", nameAr: "البحرين", nameEn: "Bahrain", currency: "دينار" },
  { code: "OM", dial: "968", nameAr: "عُمان", nameEn: "Oman", currency: "ريال" },
  { code: "EG", dial: "20", nameAr: "مصر", nameEn: "Egypt", currency: "جنيه" },
  { code: "LB", dial: "961", nameAr: "لبنان", nameEn: "Lebanon", currency: "ل.ل" },
  { code: "SY", dial: "963", nameAr: "سوريا", nameEn: "Syria", currency: "ل.س" },
  { code: "IQ", dial: "964", nameAr: "العراق", nameEn: "Iraq", currency: "دينار" },
  { code: "YE", dial: "967", nameAr: "اليمن", nameEn: "Yemen", currency: "ريال" },
  { code: "DZ", dial: "213", nameAr: "الجزائر", nameEn: "Algeria", currency: "دينار" },
  { code: "MA", dial: "212", nameAr: "المغرب", nameEn: "Morocco", currency: "درهم" },
  { code: "TN", dial: "216", nameAr: "تونس", nameEn: "Tunisia", currency: "دينار" },
  { code: "LY", dial: "218", nameAr: "ليبيا", nameEn: "Libya", currency: "دينار" },
  { code: "SD", dial: "249", nameAr: "السودان", nameEn: "Sudan", currency: "جنيه" },
  { code: "TR", dial: "90", nameAr: "تركيا", nameEn: "Turkey", currency: "ليرة" },
  { code: "CA", dial: "1", nameAr: "كندا", nameEn: "Canada", currency: "$" },
  { code: "GB", dial: "44", nameAr: "بريطانيا", nameEn: "United Kingdom", currency: "£" },
  { code: "DE", dial: "49", nameAr: "ألمانيا", nameEn: "Germany", currency: "€" },
  { code: "MY", dial: "60", nameAr: "ماليزيا", nameEn: "Malaysia", currency: "ريال" },
  { code: "ID", dial: "62", nameAr: "إندونيسيا", nameEn: "Indonesia", currency: "روبية" },
  { code: "AU", dial: "61", nameAr: "أستراليا", nameEn: "Australia", currency: "$" },
];

export function findCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

export function countryName(code: string, locale: "ar" | "en" = "ar"): string {
  const c = findCountry(code);
  if (!c) return code;
  return locale === "ar" ? c.nameAr : c.nameEn;
}

export function currencyFor(code: string): string {
  return findCountry(code)?.currency ?? "";
}

export type PhoneResult =
  | { ok: true; e164: string; waDigits: string; dial: string; national: string }
  | { ok: false; error: "empty" | "bad_chars" | "bad_length" | "unknown_dial" };

/** Core normalizer. raw: what the user typed; countryCode: selected ISO country (for local numbers). */
export function normalizePhone(raw: string, countryCode = "JO"): PhoneResult {
  const country = findCountry(countryCode) ?? findCountry("JO")!;
  let s = (raw || "").replace(/[\s\-().]/g, "");
  if (!s) return { ok: false, error: "empty" };
  if (!/^\+?\d+$/.test(s)) return { ok: false, error: "bad_chars" };

  let dial = "";
  let national = "";

  if (s.startsWith("+")) {
    // International with plus: guess dial by longest match, else trust the selected country.
    const rest = s.slice(1);
    const match = COUNTRIES.filter((c) => rest.startsWith(c.dial))
      .sort((a, b) => b.dial.length - a.dial.length)[0];
    if (match) {
      dial = match.dial;
      national = rest.slice(dial.length);
    } else {
      dial = country.dial;
      national = rest;
    }
  } else if (s.startsWith("00")) {
    // International with 00 prefix: "00962 787262186"
    const rest = s.slice(2);
    const match = COUNTRIES.filter((c) => rest.startsWith(c.dial))
      .sort((a, b) => b.dial.length - a.dial.length)[0];
    if (match) {
      dial = match.dial;
      national = rest.slice(dial.length);
    } else {
      return { ok: false, error: "unknown_dial" };
    }
  } else {
    // Local/national form — belongs to the selected country.
    dial = country.dial;
    national = s;
    // Jordan-style leading 0 (mobile "07...", landline "06...") is not dialed internationally.
    if (dial !== "1" && national.startsWith("0")) {
      national = national.replace(/^0+/, "");
    }
  }

  if (national.length < 6 || national.length > 12) return { ok: false, error: "bad_length" };

  const e164 = `+${dial}${national}`;
  return { ok: true, e164, waDigits: `${dial}${national}`, dial, national };
}

/** Accepts any format the user may log in with and resolves it to the stored E.164. */
export function loginVariants(raw: string, countryCode = "JO"): string[] {
  const out = new Set<string>();
  const trimmed = (raw || "").trim();
  out.add(trimmed.replace(/\s/g, "")); // as typed
  const n = normalizePhone(trimmed, countryCode);
  if (n.ok) {
    out.add(n.e164);
    // A stored number might also exist without the + prefix.
    out.add(n.waDigits);
    out.add(`00${n.waDigits}`);
  }
  return [...out];
}

/** True when the string already looks like a normalized E.164 phone. */
export function isE164(s: string): boolean {
  return /^\+\d{8,15}$/.test(s);
}
