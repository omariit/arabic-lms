/**
 * Login input normalisation.
 *
 * Real users type Arabic-Indic digits (٠٧٨٧٢٦٢١٨٦), and mobile keyboards replace
 * "-" with "–"/"—" or add a non-breaking space. Those are typing artifacts, not
 * different credentials, so they must never lock anyone out.
 */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** ٠٧٨٧٢٦٢١٨٦ / ۰۷۸ → 0787262186 */
export function toAsciiDigits(input: string): string {
  return (input ?? "").replace(/[٠-٩۰-۹]/g, (d) => {
    const a = ARABIC_INDIC.indexOf(d);
    if (a >= 0) return String(a);
    const e = EXTENDED_ARABIC_INDIC.indexOf(d);
    return String(e >= 0 ? e : 0);
  });
}

/** Keeps digits and a leading "+"; drops spaces, dashes, brackets, invisible chars. */
export function normalizePhoneInput(raw: string): string {
  const ascii = toAsciiDigits(raw ?? "");
  const cleaned = ascii.replace(/[\s\u200e\u200f\u061c\-().]/g, "");
  if (cleaned.startsWith("+")) return `+${cleaned.slice(1).replace(/\D/g, "")}`;
  return cleaned.replace(/\D/g, "");
}

/** Unicode dashes and non-breaking spaces are keyboard artifacts. */
export function normalizePunctuation(input: string): string {
  return (input ?? "")
    .replace(/[\u2010-\u2015\u2212]/g, "-") // – — ‒ ― −
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, ""); // zero-width / bidi marks
}

/**
 * Passwords to try, in order: exactly what was typed, then the same value after
 * fixing keyboard artifacts and trimming. The original always wins.
 */
export function passwordCandidates(raw: string): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    if (v && !out.includes(v)) out.push(v);
  };
  push(raw ?? "");
  push(normalizePunctuation(raw ?? "").trim());
  push(toAsciiDigits(normalizePunctuation(raw ?? "")).trim());
  return out;
}
