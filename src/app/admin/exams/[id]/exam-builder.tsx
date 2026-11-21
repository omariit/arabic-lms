"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Input, Label, Select, Textarea } from "@/components/ui/primitives";

type Question = { id: string; text: string; type: string; options: string[]; correctIndex: number; position: number };
type Exam = {
  id: string;
  title: string;
  type: "MCQ" | "VOICE";
  durationMin: number;
  maxGrade: number;
  published: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  course: { id: string; title: string };
  questions: Question[];
  _count?: { attempts: number };
};

/** Question editor + exam settings (publish, randomisation, delete). Auto-loads. */
export function ExamBuilder() {
  const params = useParams<{ id: string }>();
  const examId = params.id;
  const router = useRouter();

  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [type, setType] = useState("MCQ");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exams/${examId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذّر التحميل");
      setExam(data.exam);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2200);
  };

  const patchExam = async (patch: Partial<Pick<Exam, "title" | "durationMin" | "maxGrade" | "published" | "shuffleQuestions" | "shuffleOptions">>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/exams/${examId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("تعذّر الحفظ");
      setExam((e) => (e ? { ...e, ...patch } : e));
      flash("تم الحفظ ✓");
    } catch {
      setError("تعذّر حفظ التغييرات — تحققي من الاتصال");
    } finally {
      setBusy(false);
    }
  };

  const removeExam = async () => {
    if (!window.confirm("حذف الاختبار نهائيًا مع كل محاولات الطالبات؟ لا يمكن التراجع.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/exams/${examId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("تعذّر الحذف");
      router.push("/admin/exams");
    } catch {
      setError("تعذّر حذف الاختبار");
      setBusy(false);
    }
  };

  const optionCount = type === "TRUE_FALSE" ? 2 : 4;

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId,
          text,
          type,
          options: type === "TRUE_FALSE" ? ["صح", "خطأ"] : options.slice(0, optionCount).map(String),
          correctIndex,
        }),
      });
      setText("");
      setOptions(["", "", "", ""]);
      setCorrectIndex(0);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="py-10 text-center text-sm text-gray-500">جارٍ تحميل المحرر…</p>;

  if (error || !exam) {
    return (
      <Card>
        <CardContent className="space-y-2 py-8 text-center">
          <p className="text-sm text-red-700">{error ?? "الاختبار غير موجود"}</p>
          <Button size="sm" onClick={() => void load()}>إعادة المحاولة</Button>
        </CardContent>
      </Card>
    );
  }

  const toggle = (label: string, hint: string, key: "published" | "shuffleQuestions" | "shuffleOptions") => (
    <button
      type="button"
      onClick={() => void patchExam({ [key]: !exam[key] } as never)}
      disabled={busy}
      className="flex w-full items-start justify-between gap-3 rounded-2xl border border-brand-100 bg-white p-3 text-start transition hover:border-brand-300 disabled:opacity-60"
    >
      <span>
        <span className="block text-sm font-extrabold">{label}</span>
        <span className="block text-[11px] text-gray-500">{hint}</span>
      </span>
      <span className={`mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition ${exam[key] ? "bg-emerald-500" : "bg-gray-300"}`}>
        <span className={`block h-5 w-5 rounded-full bg-white transition ${exam[key] ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-brand-900/50">📚 {exam.course.title}</p>
              <h2 className="text-lg font-extrabold">{exam.title}</h2>
              <p className="text-[11px] text-gray-500">
                {exam.type === "VOICE" ? "🎤 اختبار صوتي (تصحيح يدوي)" : "📝 اختيار من متعدد (تصحيح آلي)"}
                {exam._count ? ` · ${exam._count.attempts} محاولة` : ""}
              </p>
            </div>
            <Badge tone={exam.published ? "green" : "gray"}>{exam.published ? "منشور" : "مسودة"}</Badge>
          </div>

          {saved && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{saved}</p>}

          {toggle("نشر الاختبار للطالبات", "عند الإيقاف لا تظهر للطالبات إطلاقًا", "published")}
          {exam.type !== "VOICE" && (
            <>
              {toggle("ترتيب الأسئلة عشوائيًا", "كل طالبة ترى ترتيبًا مختلفًا — والتصحيح يبقى مطابقًا", "shuffleQuestions")}
              {toggle("ترتيب الخيارات عشوائيًا", "تُخلط الخيارات داخل كل سؤال", "shuffleOptions")}
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>المدة (دقيقة)</Label>
              <Input
                dir="ltr"
                type="number"
                min={1}
                defaultValue={exam.durationMin}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v && v !== exam.durationMin) void patchExam({ durationMin: v });
                }}
              />
            </div>
            <div>
              <Label>الدرجة العظمى</Label>
              <Input
                dir="ltr"
                type="number"
                min={1}
                defaultValue={exam.maxGrade}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v && v !== exam.maxGrade) void patchExam({ maxGrade: v });
                }}
              />
            </div>
          </div>

          <Button variant="outline" size="sm" className="text-red-700" onClick={removeExam} disabled={busy}>
            🗑️ حذف الاختبار
          </Button>
        </CardContent>
      </Card>

      {exam.type !== "VOICE" && (
        <>
          <Card>
            <CardContent className="space-y-3 pt-5">
              <div><Label>نص السؤال</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[70px]" /></div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>النوع</Label>
                  <Select value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="MCQ">اختيار من متعدد</option>
                    <option value="TRUE_FALSE">صح / خطأ</option>
                  </Select>
                </div>
                <div className="w-32">
                  <Label>الإجابة الصحيحة</Label>
                  <Select dir="ltr" value={correctIndex} onChange={(e) => setCorrectIndex(Number(e.target.value))}>
                    {Array.from({ length: optionCount }, (_, i) => <option key={i} value={i}>خيار {i + 1}</option>)}
                  </Select>
                </div>
              </div>
              {type === "MCQ" && (
                <div className="grid grid-cols-2 gap-2">
                  {options.map((o, i) => (
                    <Input key={i} placeholder={`خيار ${i + 1}`} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
                  ))}
                </div>
              )}
              <Button className="w-full" onClick={add} disabled={busy || !text.trim()}>إضافة السؤال</Button>
            </CardContent>
          </Card>

          {exam.questions.map((q, i) => (
            <Card key={q.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold">{i + 1}. {q.text}</p>
                  <Button size="sm" variant="outline" onClick={() => remove(q.id)} disabled={busy}>حذف</Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  {q.options.map((o, oi) => (
                    <Badge key={oi} tone={oi === q.correctIndex ? "green" : "gray"}>{oi === q.correctIndex ? "✓ " : ""}{o}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {exam.questions.length === 0 && (
            <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
              لا أسئلة بعد — أضيفي السؤال الأول من الأعلى.
            </p>
          )}
        </>
      )}
    </div>
  );
}
