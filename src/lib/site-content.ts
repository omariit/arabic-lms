/**
 * Landing-page content management (CMS).
 *
 * A single `SiteContent` row (id="landing") stores:
 *   - `sections`: { key: boolean } — which landing sections are visible
 *   - `texts`: { ar: {key: string|list}, en: {...} } — per-locale overrides of the i18n dict
 *
 * Every text field supports `**word**` markers rendered as gold word-highlights.
 */

import { db } from "@/lib/db";

export type SiteTexts = Record<string, string | string[] | number[]>;
export type SiteData = {
  sections: Record<string, boolean>;
  texts: { ar: SiteTexts; en: SiteTexts };
};

export const DEFAULT_SECTIONS: Record<string, boolean> = {
  hero: true,
  levels: true,
  band: true,
  teacher: true,
  stats: true,
  steps: true,
  features: true,
  courses: true,
  methodology: true,
  testimonials: true,
  finalCta: true,
  whatsappFloat: true,
};

export const SECTION_LABELS: Record<string, { ar: string; en: string; icon: string }> = {
  hero: { ar: "القسم الرئيسي (البطل)", en: "Hero section", icon: "🌟" },
  levels: { ar: "المستويات الثلاثة", en: "Three levels", icon: "📖" },
  band: { ar: "شريط المسار المتكامل", en: "Path banner", icon: "🟩" },
  teacher: { ar: "تعرفي على المعلمة", en: "Meet the teacher", icon: "👩‍🏫" },
  stats: { ar: "الأرقام", en: "Statistics", icon: "📊" },
  steps: { ar: "كيف تبدئين؟", en: "How to start", icon: "🪜" },
  features: { ar: "المميزات", en: "Features", icon: "✨" },
  courses: { ar: "الدورات", en: "Courses", icon: "🎓" },
  methodology: { ar: "المنهجية", en: "Methodology", icon: "📜" },
  testimonials: { ar: "آراء الطالبات", en: "Testimonials", icon: "💬" },
  finalCta: { ar: "دعوة التسجيل الختامية", en: "Final CTA", icon: "🏁" },
  whatsappFloat: { ar: "زر واتساب العائم", en: "Floating WhatsApp", icon: "💬" },
};

const EMPTY: SiteData = { sections: { ...DEFAULT_SECTIONS }, texts: { ar: {}, en: {} } };

/** Load the landing content row (defaults when missing/corrupt). Never throws. */
export async function getSiteData(): Promise<SiteData> {
  try {
    const row = await db.siteContent.findUnique({ where: { id: "landing" } });
    if (!row) return { sections: { ...DEFAULT_SECTIONS }, texts: { ar: {}, en: {} } };
    const raw = row.data as Partial<SiteData> | null;
    return {
      sections: { ...DEFAULT_SECTIONS, ...(raw?.sections ?? {}) },
      texts: { ar: raw?.texts?.ar ?? {}, en: raw?.texts?.en ?? {} },
    };
  } catch {
    return { sections: { ...DEFAULT_SECTIONS }, texts: { ar: {}, en: {} } };
  }
}

export function saveSiteData(data: SiteData) {
  return db.siteContent.upsert({
    where: { id: "landing" },
    update: { data: data as unknown as object },
    create: { id: "landing", data: data as unknown as object },
  });
}

/** Shallow-merge locale overrides over a base dict (arrays replace whole). */
export function mergeDicts<T extends Record<string, unknown>>(base: T, overrides: SiteTexts) {
  return { ...base, ...overrides } as T;
}

/** Normalize staff-provided SiteContent (defensive validation). */
export function sanitizeSiteData(input: unknown): SiteData {
  const src = (input ?? {}) as Partial<SiteData>;
  const sections: Record<string, boolean> = { ...DEFAULT_SECTIONS };
  if (src.sections && typeof src.sections === "object") {
    for (const k of Object.keys(DEFAULT_SECTIONS)) {
      if (typeof (src.sections as Record<string, unknown>)[k] === "boolean")
        sections[k] = (src.sections as Record<string, boolean>)[k];
    }
  }
  const clean = (o: unknown): SiteTexts => {
    const out: SiteTexts = {};
    if (!o || typeof o !== "object") return out;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string" && v.length <= 2000) out[k] = v;
      else if (Array.isArray(v))
        out[k] = v.slice(0, 12).map((x) => (typeof x === "string" ? x.slice(0, 600) : String(x ?? "")));
      else if (typeof v === "number" && Number.isFinite(v)) out[k] = String(v);
    }
    return out;
  };
  return { sections, texts: { ar: clean(src.texts?.ar), en: clean(src.texts?.en) } };
}
