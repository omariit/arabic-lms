"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Badge, Textarea } from "@/components/ui/primitives";
import { LessonAudioUploader } from "@/components/lesson-audio";
import { CoverUploader, LessonResources } from "@/components/course-extras";
import { COUNTRIES, countryName } from "@/lib/phone";

type Module = { id: string; title: string; position: number; lessons: Lesson[] };
type Lesson = { id: string; title: string; youtubeId: string; access: string; position: number; description?: string; scriptText?: string; assignmentTitle?: string | null; assignmentInstructions?: string; audioKey?: string | null };
type CoursePrice = { id?: string; countryCode: string; price: number };
type CourseInfo = { price: number; weeklyMeetings: string; prices: CoursePrice[]; modules: Module[]; coverImageKey?: string | null; outcomes?: string; requirements?: string; published?: boolean; title?: string };

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Accepts any YouTube form: raw id, watch?v=, youtu.be/, shorts/, embed/, live/. */
function parseYouTubeId(input: string): string {
  let s = (input || "").trim();
  if (!s) return "";
  if (YT_ID_RE.test(s)) return s;
  try {
    if (!/^https?:\/\//i.test(s)) {
      if (/^(www\.)?(youtube\.com|youtu\.be)/i.test(s)) s = "https://" + s;
      else return "";
    }
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
      return YT_ID_RE.test(seg) ? seg : "";
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && YT_ID_RE.test(v)) return v;
      const [head, seg] = u.pathname.split("/").filter(Boolean);
      if ((head === "shorts" || head === "embed" || head === "live") && seg && YT_ID_RE.test(seg)) return seg;
    }
  } catch { /* not a URL */ }
  return "";
}

/** Curriculum builder: sections (modules) → lessons. Accepts full YouTube URLs,
 * shows thumbnails, supports edit-in-place and reordering. */
export function CourseBuilder() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const [modules, setModules] = useState<Module[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const [moduleTitle, setModuleTitle] = useState("");
  const [weeklyMeetings, setWeeklyMeetings] = useState("");
  const [meetingsSaved, setMeetingsSaved] = useState(false);
  const [basePrice, setBasePrice] = useState(0);
  const [prices, setPrices] = useState<CoursePrice[]>([]);
  const [newCC, setNewCC] = useState("US");
  const [newPrice, setNewPrice] = useState("");
  const [outcomes, setOutcomes] = useState("");
  const [requirements, setRequirements] = useState("");
  const [published, setPublished] = useState(false);
  const [hasCover, setHasCover] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [priceSaved, setPriceSaved] = useState(false);
  const [lessonForms, setLessonForms] = useState<Record<string, { title: string; youtubeId: string; access: string }>>({});
  const [editing, setEditing] = useState<Record<string, { title: string; youtubeId: string; access: string; description: string; scriptText: string; assignmentTitle: string; assignmentInstructions: string }>>({});

  const load = async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/courses");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? `تعذّر تحميل المحتوى (${res.status})`);
      const course = (data.courses ?? []).find((c: { id: string }) => c.id === courseId) as (CourseInfo & { id: string }) | undefined;
      if (!course) throw new Error("هذه الدورة غير موجودة أو ليست لك");
      setModules(course?.modules ?? []);
      setWeeklyMeetings(course?.weeklyMeetings ?? "");
      setBasePrice(Number(course?.price ?? 0));
      setPrices(course?.prices ?? []);
      setOutcomes(course?.outcomes ?? "");
      setRequirements(course?.requirements ?? "");
      setPublished(Boolean(course?.published));
      setHasCover(Boolean(course?.coverImageKey));
      setLoaded(true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "تعذّر تحميل المحتوى");
    } finally { setBusy(false); }
  };

  // Open the builder ready to edit — no "click to load" dead screen.
  useEffect(() => { void load(); }, []);

  if (!loaded) {
    return (
      <div className="space-y-2">
        <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "تحميل المحتوى"}</Button>
        {loadError && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{loadError}</p>}
      </div>
    );
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const addModule = () => run(async () => {
    await fetch("/api/admin/modules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, title: moduleTitle }),
    });
    setModuleTitle("");
    await load();
  });

  const renameModule = (id: string, title: string) => run(async () => {
    await fetch(`/api/admin/modules/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    await load();
  });

  const deleteModule = (id: string) => run(async () => {
    if (!confirm("حذف القسم وكل دروسه؟")) return;
    await fetch(`/api/admin/modules/${id}`, { method: "DELETE" });
    await load();
  });

  const moveModule = (m: Module, dir: -1 | 1) => run(async () => {
    const sorted = [...modules].sort((a, b) => a.position - b.position);
    const i = sorted.findIndex((x) => x.id === m.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    await Promise.all([
      fetch(`/api/admin/modules/${m.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: sorted[j].position }) }),
      fetch(`/api/admin/modules/${sorted[j].id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: m.position }) }),
    ]);
    await load();
  });

  const addLesson = (moduleId: string) => {
    const form = lessonForms[moduleId] ?? { title: "", youtubeId: "", access: "ENROLLED" };
    const ytId = parseYouTubeId(form.youtubeId);
    if (!form.title.trim() || !ytId) return;
    return run(async () => {
      await fetch("/api/admin/lessons", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, title: form.title, youtubeId: ytId, access: form.access }),
      });
      setLessonForms((f) => ({ ...f, [moduleId]: { title: "", youtubeId: "", access: "ENROLLED" } }));
      await load();
    });
  };

  const savePrice = async () => {
    const value = Number(newPrice);
    if (!Number.isFinite(value) || value < 0) return;
    await fetch(`/api/admin/courses/${courseId}/pricing`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode: newCC, price: value }),
    });
    setNewPrice("");
    setPriceSaved(true);
    setTimeout(() => setPriceSaved(false), 2500);
    await load();
  };

  const deletePrice = async (cc: string) => {
    await fetch(`/api/admin/courses/${courseId}/pricing?countryCode=${cc}`, { method: "DELETE" });
    await load();
  };

  const saveMeetings = () => run(async () => {
    await fetch(`/api/admin/courses/${courseId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weeklyMeetings }),
    });
    setMeetingsSaved(true);
    setTimeout(() => setMeetingsSaved(false), 2500);
  });

  const saveLesson = (lesson: Lesson) => {
    const form = editing[lesson.id];
    if (!form) return;
    const ytId = parseYouTubeId(form.youtubeId) || lesson.youtubeId;
    return run(async () => {
      await fetch(`/api/admin/lessons/${lesson.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, youtubeId: ytId, access: form.access, description: form.description, scriptText: form.scriptText, assignmentTitle: form.assignmentTitle, assignmentInstructions: form.assignmentInstructions }),
      });
      setEditing((e) => { const n = { ...e }; delete n[lesson.id]; return n; });
      await load();
    });
  };

  const deleteLesson = (id: string) => run(async () => {
    if (!confirm("حذف هذا الدرس؟")) return;
    await fetch(`/api/admin/lessons/${id}`, { method: "DELETE" });
    await load();
  });

  const moveLesson = (mod: Module, lesson: Lesson, dir: -1 | 1) => run(async () => {
    const sorted = [...mod.lessons].sort((a, b) => a.position - b.position);
    const i = sorted.findIndex((x) => x.id === lesson.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    await Promise.all([
      fetch(`/api/admin/lessons/${lesson.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: sorted[j].position }) }),
      fetch(`/api/admin/lessons/${sorted[j].id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: lesson.position }) }),
    ]);
    await load();
  });

  const sorted = [...modules].sort((a, b) => a.position - b.position);
  const arrow = "rounded-lg border border-brand-200 px-2 py-1 text-xs font-bold text-brand-900 hover:bg-brand-50 disabled:opacity-40";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div>
            <Label>💵 السعر الشهري الأساسي</Label>
            <p className="mt-1 text-sm text-brand-900/70">
              {basePrice === 0 ? "مجانية" : <><span className="font-extrabold text-brand-800">{basePrice} دينار</span> شهريًا</>}
              <span className="text-brand-900/50"> — يُطبَّق على أي دولة ليست لها قيمة مخصّصة بالأَسفل.</span>
            </p>
          </div>

          <div className="rounded-2xl bg-brand-50/60 p-3">
            <p className="text-xs font-extrabold text-brand-900">🌍 أسعار مخصّصة لكل دولة</p>
            {prices.length === 0 ? (
              <p className="mt-1 text-xs text-brand-900/55">لا توجد أسعار مخصّصة — الجميع يرى السعر الأساسي.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {prices.map((p) => (
                  <li key={p.countryCode} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
                    <span className="font-bold">{countryName(p.countryCode)} <span className="text-xs text-brand-900/45" dir="ltr">({p.countryCode})</span></span>
                    <span className="flex items-center gap-2">
                      <span className="font-extrabold text-brand-800">{p.price === 0 ? "مجانية" : `${p.price} ${p.countryCode === "US" ? "$" : "دينار"}`}</span>
                      <button onClick={() => deletePrice(p.countryCode)} className="rounded-lg border border-red-200 px-2 py-0.5 text-xs font-bold text-red-600">حذف</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <Select value={newCC} onChange={(e) => setNewCC(e.target.value)} className="min-w-0 flex-1">
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.nameAr}</option>)}
              </Select>
              <Input dir="ltr" type="number" className="w-24" placeholder="السعر" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
              <Button onClick={savePrice} disabled={!newPrice.trim()}>إضافة</Button>
            </div>
            {priceSaved && <p className="mt-1 text-xs font-bold text-brand-700">تم الحفظ ✓</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <CoverUploader courseId={courseId} hasCover={hasCover} onChange={() => load()} />
          <div>
            <Label>🎯 ماذا ستتعلّم الطالبة؟ (سطر لكل نقطة)</Label>
            <Textarea
              rows={4}
              placeholder={"قراءة صحيحة متقنة · أحكام التجويد الأساسية · ضبط المخارج والصفات"}
              value={outcomes}
              onChange={(e) => setOutcomes(e.target.value)}
            />
          </div>
          <div>
            <Label>📋 المتطلبات السابقة (سطر لكل متطلب)</Label>
            <Textarea
              rows={2}
              placeholder={"إلمام بقراءة القرآن · جهاز بميكروفون للواجبات الصوتية"}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => run(async () => {
                await fetch(`/api/admin/courses/${courseId}`, {
                  method: "PUT", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ outcomes, requirements }),
                });
                setSaveMsg("تم حفظ تفاصيل الدورة ✓");
                setTimeout(() => setSaveMsg(""), 2500);
              })}
              disabled={busy}
            >حفظ تفاصيل الدورة</Button>
            <Button
              variant={published ? "secondary" : "success"}
              onClick={() => run(async () => {
                await fetch(`/api/admin/courses/${courseId}`, {
                  method: "PUT", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ published: !published }),
                });
                setPublished((v) => !v);
                setSaveMsg(!published ? "الدورة منشورة الآن ✓" : "أصبحت مسودّة");
                setTimeout(() => setSaveMsg(""), 2500);
              })}
              disabled={busy}
            >{published ? "🙈 إخفاء الدورة" : "🚀 نشر الدورة"}</Button>
            {saveMsg && <span className="text-xs font-bold text-brand-700">{saveMsg}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <Label>🗓 جدول اللقاءات الأسبوعية المباشرة (يظهر في صفحة الدورة)</Label>
          <Textarea rows={3} placeholder={"مثال:\nالثلاثاء 6:00 م — تسميع جماعي\nالخميس 6:00 م — درس جديد"} value={weeklyMeetings} onChange={(e) => setWeeklyMeetings(e.target.value)} />
          <div className="mt-2 flex items-center gap-2">
            <Button onClick={saveMeetings} disabled={busy}>{meetingsSaved ? "تم الحفظ ✓" : "حفظ الجدول"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <Label>➕ قسم جديد داخل الدورة</Label>
          <div className="flex gap-2">
            <Input
              placeholder="مثال: الجزء الأول — قاعدة النون الساكنة"
              value={moduleTitle}
              onChange={(e) => setModuleTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && moduleTitle.trim() && addModule()}
            />
            <Button onClick={addModule} disabled={busy || !moduleTitle.trim()}>إضافة</Button>
          </div>
        </CardContent>
      </Card>

      {sorted.map((m, mi) => {
        const sortedLessons = [...m.lessons].sort((a, b) => a.position - b.position);
        return (
          <Card key={m.id}>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-xs font-extrabold text-white">{mi + 1}</span>
                <ModuleTitle title={m.title} onSave={(t) => renameModule(m.id, t)} />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button className={arrow} onClick={() => moveModule(m, -1)} disabled={busy || mi === 0} aria-label="أعلى">▲</button>
                <button className={arrow} onClick={() => moveModule(m, 1)} disabled={busy || mi === sorted.length - 1} aria-label="أسفل">▼</button>
                <Button size="sm" variant="destructive" onClick={() => deleteModule(m.id)} disabled={busy}>حذف</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {sortedLessons.length === 0 && <p className="text-xs text-brand-900/50">لا توجد دروس في هذا القسم بعد</p>}

              {sortedLessons.map((l, li) => (
                <div key={l.id} className="rounded-xl bg-brand-50 p-3">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${l.youtubeId}/mqdefault.jpg`}
                      alt=""
                      className="h-12 w-20 shrink-0 rounded-lg object-cover"
                      onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.25")}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{l.title}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <Badge tone={l.access === "FREE_PREVIEW" ? "green" : "gray"}>
                          {l.access === "FREE_PREVIEW" ? "تجريبي" : "للمسجلات"}
                        </Badge>
                        <span className="text-[10px] text-gray-400" dir="ltr">{l.youtubeId}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1 sm:flex-row">
                      <button className={arrow} onClick={() => moveLesson(m, l, -1)} disabled={busy || li === 0} aria-label="أعلى">▲</button>
                      <button className={arrow} onClick={() => moveLesson(m, l, 1)} disabled={busy || li === sortedLessons.length - 1} aria-label="أسفل">▼</button>
                      <Button size="sm" variant="outline" onClick={() => setEditing((e) => ({ ...e, [l.id]: { title: l.title, youtubeId: l.youtubeId, access: l.access, description: l.description ?? "", scriptText: l.scriptText ?? "", assignmentTitle: l.assignmentTitle ?? "", assignmentInstructions: l.assignmentInstructions ?? "" } }))}>تعديل</Button>
                      <a href={`/admin/lessons/${l.id}`} className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-extrabold text-amber-800">📥 الواجبات</a>
                      <Button size="sm" variant="outline" onClick={() => deleteLesson(l.id)} disabled={busy}>حذف</Button>
                    </div>
                  </div>

                  {editing[l.id] && (
                    <div className="mt-3 space-y-2 rounded-xl border border-brand-200 bg-white p-3">
                      <Input value={editing[l.id].title} placeholder="العنوان" onChange={(e) => setEditing((f) => ({ ...f, [l.id]: { ...f[l.id], title: e.target.value } }))} />
                      <Input dir="ltr" value={editing[l.id].youtubeId} placeholder="رابط يوتيوب أو معرّف الفيديو" onChange={(e) => setEditing((f) => ({ ...f, [l.id]: { ...f[l.id], youtubeId: e.target.value } }))} />
                      <Textarea rows={2} placeholder="وصف المحاضرة (يظهر تحت الفيديو)" value={editing[l.id].description} onChange={(e) => setEditing((f) => ({ ...f, [l.id]: { ...f[l.id], description: e.target.value } }))} />
                      <Textarea rows={4} placeholder="السكريبت / النص الكامل للدرس" value={editing[l.id].scriptText} onChange={(e) => setEditing((f) => ({ ...f, [l.id]: { ...f[l.id], scriptText: e.target.value } }))} />
                      <Input placeholder="عنوان الواجب (اختياري)" value={editing[l.id].assignmentTitle} onChange={(e) => setEditing((f) => ({ ...f, [l.id]: { ...f[l.id], assignmentTitle: e.target.value } }))} />
                      <Textarea rows={3} placeholder="تعليمات الواجب" value={editing[l.id].assignmentInstructions} onChange={(e) => setEditing((f) => ({ ...f, [l.id]: { ...f[l.id], assignmentInstructions: e.target.value } }))} />
                      <LessonAudioUploader
                        lessonId={l.id}
                        hasAudio={!!l.audioKey}
                        onChange={() => load()}
                      />
                      <LessonResources lessonId={l.id} />
                      <div className="flex gap-2">
                        <Select value={editing[l.id].access} onChange={(e) => setEditing((f) => ({ ...f, [l.id]: { ...f[l.id], access: e.target.value } }))}>
                          <option value="ENROLLED">للمسجلات فقط</option>
                          <option value="FREE_PREVIEW">معاينة مجانية</option>
                        </Select>
                        <Button onClick={() => saveLesson(l)} disabled={busy}>حفظ</Button>
                        <Button variant="outline" onClick={() => setEditing((f) => { const n = { ...f }; delete n[l.id]; return n; })}>إلغاء</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="mt-3 space-y-2 rounded-xl border border-dashed border-brand-300 bg-white p-3">
                <p className="text-xs font-extrabold text-brand-900/70">🎬 إضافة درس جديد — الصقي أي رابط يوتيوب</p>
                <Input placeholder="عنوان الدرس" value={lessonForms[m.id]?.title ?? ""} onChange={(e) => setLessonForms((f) => ({ ...f, [m.id]: { ...(f[m.id] ?? { youtubeId: "", access: "ENROLLED" }), title: e.target.value } }))} />
                <Input dir="ltr" placeholder="https://youtube.com/watch?v=… أو https://youtu.be/…" value={lessonForms[m.id]?.youtubeId ?? ""} onChange={(e) => setLessonForms((f) => ({ ...f, [m.id]: { ...(f[m.id] ?? { title: "", access: "ENROLLED" }), youtubeId: e.target.value } }))} />
                {(() => {
                  const id = parseYouTubeId(lessonForms[m.id]?.youtubeId ?? "");
                  return id ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className="h-14 w-24 rounded-lg object-cover" />
                      <span className="text-[11px] font-bold text-emerald-700">✓ رابط صحيح — {id}</span>
                    </div>
                  ) : (lessonForms[m.id]?.youtubeId ?? "").trim() ? (
                    <p className="text-[11px] font-bold text-red-600">الرابط غير صالح — انسخي الرابط كاملاً من يوتيوب</p>
                  ) : null;
                })()}
                <Select value={lessonForms[m.id]?.access ?? "ENROLLED"} onChange={(e) => setLessonForms((f) => ({ ...f, [m.id]: { ...(f[m.id] ?? { title: "", youtubeId: "" }), access: e.target.value } }))}>
                  <option value="ENROLLED">للمسجلات فقط</option>
                  <option value="FREE_PREVIEW">معاينة مجانية (مفتوحة للجميع)</option>
                </Select>
                <Button className="w-full" onClick={() => addLesson(m.id)} disabled={busy || !lessonForms[m.id]?.title?.trim() || !parseYouTubeId(lessonForms[m.id]?.youtubeId ?? "")}>
                  إضافة الدرس
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ModuleTitle({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="truncate text-left text-sm font-extrabold text-brand-950 hover:underline" title="اضغطي للتعديل">
        {title} ✏️
      </button>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 gap-1">
      <Input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (onSave(value), setEditing(false))} />
      <Button size="sm" onClick={() => { onSave(value); setEditing(false); }}>✓</Button>
    </div>
  );
}
