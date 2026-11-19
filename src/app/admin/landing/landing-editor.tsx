"use client";

import { useEffect, useState } from "react";

type SiteData = {
  sections: Record<string, boolean>;
  texts: { ar: Record<string, string | string[] | number[]>; en: Record<string, string | string[] | number[]> };
};

const SECTION_DEFS: Array<{ key: string; label: string; icon: string }> = [
  { key: "hero", label: "القسم الرئيسي (البطل)", icon: "🌟" },
  { key: "levels", label: "المستويات الثلاثة", icon: "📖" },
  { key: "band", label: "شريط المسار المتكامل", icon: "🟩" },
  { key: "teacher", label: "تعرفي على المعلمة", icon: "👩‍🏫" },
  { key: "stats", label: "الأرقام", icon: "📊" },
  { key: "steps", label: "كيف تبدئين؟", icon: "🪜" },
  { key: "features", label: "المميزات", icon: "✨" },
  { key: "courses", label: "الدورات", icon: "🎓" },
  { key: "methodology", label: "المنهجية", icon: "📜" },
  { key: "testimonials", label: "آراء الطالبات", icon: "💬" },
  { key: "finalCta", label: "دعوة التسجيل الختامية", icon: "🏁" },
  { key: "whatsappFloat", label: "زر واتساب العائم", icon: "💬" },
];

type FieldDef = { key: string; label: string; type: "text" | "area" | "lines" };
type FieldGroup = { title: string; icon: string; fields: FieldDef[] };

const GROUPS: FieldGroup[] = [
  {
    title: "القسم الرئيسي", icon: "🌟",
    fields: [
      { key: "heroLines", label: "سطور العنوان", type: "lines" },
    ],
  },
  {
    title: "المستويات", icon: "📖",
    fields: [
      { key: "levelsKicker", label: "كلمة القسم الصغيرة", type: "text" },
      { key: "levelsTitle", label: "العنوان", type: "text" },
      { key: "levelsTitleHl", label: "الجزء المُميّز", type: "text" },
      { key: "levelsSub", label: "الوصف", type: "area" },
      { key: "levelNames", label: "أسماء المستويات (سطر لكل اسم)", type: "lines" },
      { key: "levelTags", label: "وسم كل مستوى (سطر لكل وسم)", type: "lines" },
    ],
  },
  {
    title: "شريط المسار", icon: "🟩",
    fields: [
      { key: "bandTitle", label: "العنوان", type: "text" },
      { key: "bandSub", label: "الوصف", type: "text" },
    ],
  },
  {
    title: "تعرفي على المعلمة", icon: "👩‍🏫",
    fields: [
      { key: "aboutKicker", label: "كلمة القسم الصغيرة", type: "text" },
      { key: "aboutTitle", label: "العنوان", type: "text" },
      { key: "meetTeacherHl", label: "الجزء المُميّز", type: "text" },
    ],
  },
  {
    title: "الأرقام", icon: "📊",
    fields: [
      { key: "statsKicker", label: "كلمة القسم الصغيرة", type: "text" },
      { key: "statsTitle", label: "العنوان", type: "text" },
      { key: "statsLabels", label: "تسميات الأرقام (سطر لكل تسمية)", type: "lines" },
      { key: "statsValues", label: "قيم الأرقام (سطر لكل قيمة — ١ رقم، ٣ مستويات، ١٠ قراءات، ١٥ سنة، ٠ = عدد الطالبات الفعلي)", type: "lines" },
    ],
  },
  {
    title: "كيف تبدئين؟", icon: "🪜",
    fields: [
      { key: "stepsKicker", label: "كلمة القسم الصغيرة", type: "text" },
      { key: "stepsTitle", label: "العنوان", type: "text" },
    ],
  },
  {
    title: "المميزات", icon: "✨",
    fields: [
      { key: "featKicker", label: "كلمة القسم الصغيرة", type: "text" },
      { key: "featTitle", label: "العنوان", type: "text" },
    ],
  },
  {
    title: "الدورات", icon: "🎓",
    fields: [
      { key: "coursesKicker", label: "كلمة القسم الصغيرة", type: "text" },
      { key: "coursesTitle", label: "العنوان", type: "text" },
      { key: "coursesSub", label: "الوصف", type: "text" },
    ],
  },
  {
    title: "المنهجية", icon: "📜",
    fields: [
      { key: "methodKicker", label: "كلمة القسم الصغيرة", type: "text" },
      { key: "methodTitle", label: "العنوان", type: "text" },
      { key: "methodBadge", label: "شارة الصندوق", type: "text" },
    ],
  },
  {
    title: "آراء الطالبات", icon: "💬",
    fields: [
      { key: "testiKicker", label: "كلمة القسم الصغيرة", type: "text" },
      { key: "testiTitle", label: "العنوان", type: "text" },
    ],
  },
  {
    title: "الختام", icon: "🏁",
    fields: [
      { key: "ctaAyah", label: "الآية", type: "text" },
      { key: "ctaTitle", label: "العنوان", type: "text" },
      { key: "ctaSub", label: "الوصف", type: "text" },
      { key: "ctaRegister", label: "نص زر التسجيل", type: "text" },
      { key: "ctaLogin", label: "نص زر الدخول", type: "text" },
    ],
  },
  {
    title: "التذييل", icon: "📄",
    fields: [
      { key: "footerBrand", label: "اسم المنصة", type: "text" },
      { key: "footerNote", label: "ملاحظة التذييل", type: "text" },
    ],
  },
];

const btn = "rounded-xl px-4 py-2.5 text-sm font-extrabold transition disabled:opacity-50";

export function LandingEditor() {
  const [data, setData] = useState<SiteData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"ar" | "en">("ar");

  useEffect(() => {
    fetch("/api/admin/site-content")
      .then((r) => r.json())
      .then((j) => j.data && setData(j.data))
      .catch(() => {});
  }, []);

  if (!data) return <p className="p-6 text-sm text-brand-900/60">…جارٍ التحميل</p>;

  const setField = (key: string, value: string | string[] | number[]) => {
    setSaved(false);
    setData((d) =>
      d ? { ...d, texts: { ...d.texts, [tab]: { ...d.texts[tab], [key]: value } } } : d
    );
  };

  const toggle = (key: string) => {
    setSaved(false);
    setData((d) => (d ? { ...d, sections: { ...d.sections, [key]: !d.sections[key] } } : d));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm("استعادة كل النصوص الافتراضية وإظهار كل الأقسام؟")) return;
    const fresh: SiteData = { sections: Object.fromEntries(SECTION_DEFS.map((s) => [s.key, true])), texts: { ar: {}, en: {} } };
    setData(fresh);
    await fetch("/api/admin/site-content", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fresh) });
    setSaved(true);
  };

  /** Convert a dict field into textarea lines */
  const fieldLines = (key: string): string => {
    const v = data.texts[tab][key];
    if (Array.isArray(v)) return v.join("\n");
    if (typeof v === "string") return v;
    return "";
  };
  const setLines = (key: string, raw: string) => setField(key, raw.split("\n"));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-extrabold text-brand-950">🎨 إدارة الصفحة الرئيسية</h1>
            <p className="mt-1 text-xs text-brand-900/60">
              التحكم بإظهار/إخفاء كل قسم وتعديل نصوصه. ضعي الكلمة بين <code className="rounded bg-amber-100 px-1">**نجمتين**</code> لتظهر بتمييز ذهبي.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className={`${btn} border border-brand-200 text-brand-900 hover:bg-brand-50`}>استعادة الافتراضي</button>
            <button onClick={save} disabled={saving} className={`${btn} bg-brand-700 text-white hover:bg-brand-800`}>
              {saving ? "…" : saved ? "تم الحفظ ✓" : "حفظ التغييرات"}
            </button>
          </div>
        </div>
      </div>

      {/* Section visibility */}
      <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-extrabold text-brand-950">👁️ إظهار وإخفاء الأقسام</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SECTION_DEFS.map((s) => (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-right text-xs font-bold transition ${
                data.sections[s.key]
                  ? "border-brand-200 bg-brand-50 text-brand-950"
                  : "border-gray-200 bg-gray-50 text-gray-400"
              }`}
            >
              <span>{s.icon} {s.label}</span>
              <span className={`ml-1 h-5 w-9 rounded-full p-0.5 transition ${data.sections[s.key] ? "bg-brand-600" : "bg-gray-300"}`}>
                <span className={`block h-4 w-4 rounded-full bg-white transition ${data.sections[s.key] ? "translate-x-4" : ""}`} />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Locale tabs */}
      <div className="flex gap-2">
        {(["ar", "en"] as const).map((l) => (
          <button key={l} onClick={() => setTab(l)}
            className={`${btn} ${tab === l ? "bg-brand-700 text-white" : "border border-brand-200 bg-white text-brand-900"}`}>
            {l === "ar" ? "🇯🇴 النصوص العربية" : "🇺🇸 English texts"}
          </button>
        ))}
      </div>

      {/* Field groups */}
      {GROUPS.map((g) => (
        <div key={g.title} className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-extrabold text-brand-950">{g.icon} {g.title}</h2>
          <div className="space-y-3">
            {g.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-bold text-brand-900/70">{f.label}</span>
                {f.type === "text" ? (
                  <input
                    className="w-full rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
                    value={typeof data.texts[tab][f.key] === "string" ? (data.texts[tab][f.key] as string) : ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                ) : (
                  <textarea
                    rows={f.type === "lines" ? Math.max(3, fieldLines(f.key).split("\n").length) : 3}
                    className="w-full rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
                    value={fieldLines(f.key)}
                    onChange={(e) => setLines(f.key, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      ))}

      {/* Steps editor */}
      <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-extrabold text-brand-950">🪜 خطوات البدء (٣ خطوات)</h2>
        <StepsEditor
          steps={(Array.isArray(data.texts[tab].steps) ? data.texts[tab].steps : []) as unknown as Array<{ t: string; d: string }>}
          onChange={(steps) => setField("steps", steps as unknown as string[])}
        />
      </div>
    </div>
  );
}

function StepsEditor({ steps, onChange }: { steps: Array<{ t: string; d: string }>; onChange: (s: Array<{ t: string; d: string }>) => void }) {
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-2xl border border-brand-100 bg-brand-50/40 p-3 sm:flex-row">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-xs font-extrabold text-white">{i + 1}</span>
          <input
            className="flex-1 rounded-xl border border-brand-100 px-3 py-2 text-sm"
            value={s.t ?? ""}
            placeholder="عنوان الخطوة"
            onChange={(e) => { const next = [...steps]; next[i] = { ...next[i], t: e.target.value }; onChange(next); }}
          />
          <input
            className="flex-[2] rounded-xl border border-brand-100 px-3 py-2 text-sm"
            value={s.d ?? ""}
            placeholder="وصف الخطوة"
            onChange={(e) => { const next = [...steps]; next[i] = { ...next[i], d: e.target.value }; onChange(next); }}
          />
        </div>
      ))}
    </div>
  );
}
