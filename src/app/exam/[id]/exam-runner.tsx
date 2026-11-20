"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui/primitives";
import { cn, formatSeconds } from "@/lib/utils";

type Question = { id: string; text: string; type: "MCQ" | "TRUE_FALSE"; options: string[] };
type ReviewItem = Question & { correctIndex: number; selected: number | null };

/**
 * Auto-graded electronic exam engine:
 * - Countdown timer with auto-submit on expiration
 * - Tab-switch detection warns the student and logs a SecurityViolation
 * - Instant grading + answer review (correct answers revealed only after submit)
 */
export function ExamRunner({ examId, title, durationMin, maxGrade, courseTitle, previousStatus }: {
  examId: string; title: string; durationMin: number; maxGrade: number; courseTitle: string;
  previousStatus: string | null;
}) {
  const [phase, setPhase] = useState<"loading" | "active" | "submitting" | "done" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(durationMin * 60);
  const [tabWarning, setTabWarning] = useState(false);
  const [result, setResult] = useState<{ score: number; review: ReviewItem[] } | null>(null);
  const submittingRef = useRef(false);

  const start = useCallback(async () => {
    setPhase("loading"); setError(null);
    try {
      const res = await fetch("/api/exams/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذّر بدء الاختبار");
      setQuestions(data.questions);
      setAttemptId(data.attempt.id);
      setPhase("active");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
      setPhase("error");
    }
  }, [examId]);

  // Auto-submit: on expiration or explicit submit. Server grades, client never sees keys.
  const submit = useCallback(async (auto: boolean) => {
    if (submittingRef.current || !attemptId) return;
    submittingRef.current = true;
    setPhase("submitting");
    try {
      const res = await fetch("/api/exams/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذّر الإرسال");
      setResult({ score: data.score, review: data.review });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
      setPhase("active");
    } finally {
      submittingRef.current = false;
    }
  }, [attemptId, answers]);

  // Timer
  useEffect(() => {
    if (phase !== "active") return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { void submit(true); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, submit]);

  // Tab-switch detection
  useEffect(() => {
    if (phase !== "active") return;
    let violations = 0;
    const onVisibility = () => {
      if (document.hidden) {
        violations++;
        setTabWarning(true);
        fetch("/api/security/violation", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "TAB_SWITCH_DURING_EXAM", detail: JSON.stringify({ examId, count: violations }) }),
          keepalive: true,
        }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase, examId]);

  if (phase === "loading") {
    return (
      <div className="text-center py-10">
        <p className="mb-4 text-gray-500">{error ?? "جاهزة للبدء؟"}</p>
        {error ? <Button onClick={start}>إعادة المحاولة</Button> : <Button size="lg" onClick={start}>ابدئي الاختبار</Button>}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-red-50 p-4 text-center font-bold text-red-600">{error}</p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={start}>إعادة المحاولة</Button>
          <a href="/dashboard"><Button variant="outline">لوحتي</Button></a>
        </div>
      </div>
    );
  }

  if (phase === "done" && result) {
    const pct = Math.round((result.score / maxGrade) * 100);
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              نتيجتك: <span dir="ltr">{result.score} / {maxGrade}</span>
            </CardTitle>
            <Progress value={pct} />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">{pct >= 60 ? "أحسنت! 🎉" : "تحتاجين مراجعة الدروس"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>مراجعة الإجابات</CardTitle></CardHeader>
          <CardContent className="divide-y divide-brand-50">
            {result.review.map((q, i) => (
              <div key={q.id} className="py-3">
                <p className="text-sm font-bold">{i + 1}. {q.text}</p>
                <div className="mt-2 space-y-1 text-sm">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-1.5",
                      oi === q.correctIndex && "bg-emerald-50 font-bold text-emerald-800",
                      oi === q.selected && oi !== q.correctIndex && "bg-red-50 text-red-700"
                    )}>
                      {oi === q.correctIndex && <span>✓</span>}
                      {oi === q.selected && oi !== q.correctIndex && <span>✗ اختيارك</span>}
                      <span>{opt}</span>
                    </div>
                  ))}
                  {q.selected === null && <p className="text-xs text-red-500">لم تجيبي على هذا السؤال</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (previousStatus === "SUBMITTED" || previousStatus === "GRADED") {
    return (
      <Card>
        <CardContent className="space-y-3 text-center py-8">
          <p className="font-bold text-emerald-700">أجبتِ هذا الاختبار مسبقًا ✓</p>
          <p className="text-xs text-gray-500">
            النتيجة محفوظة عند المعلمة وتظهر في لوحتك مع أي ملاحظات صوتية أو مكتوبة.
          </p>
          <div className="flex justify-center gap-2">
            <a href="/dashboard"><Button variant="outline">عودة إلى لوحتي</Button></a>
          </div>
        </CardContent>
      </Card>
    );
  }

  const answered = Object.keys(answers).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs text-gray-500">{courseTitle}</p>
          <h1 className="text-lg font-extrabold">{title}</h1>
        </div>
        <div className="text-center">
          <Badge tone={remaining < 60 ? "red" : "brand"}>⏱ {formatSeconds(remaining)}</Badge>
          <p className="mt-1 text-xs text-gray-400">{answered}/{questions.length}</p>
        </div>
      </div>

      {tabWarning && (
        <div className="rounded-xl bg-amber-100 border-2 border-amber-300 p-3 text-sm font-bold text-amber-900">
          ⚠️ تم رصد مغادرة الصفحة أثناء الاختبار — الإجراء مسجّل
        </div>
      )}

      <Card>
        <CardContent className="divide-y divide-brand-50">
          {questions.map((q, i) => (
            <div key={q.id} className="py-4">
              <p className="mb-3 text-sm font-bold">{i + 1}. {q.text}</p>
              <div className="grid gap-2">
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-right text-sm transition",
                      answers[q.id] === oi ? "border-brand-500 bg-brand-50 font-bold" : "border-brand-100 bg-white hover:bg-brand-50"
                    )}
                  >
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                      answers[q.id] === oi ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-700")}>
                      {oi + 1}
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" onClick={() => submit(false)} disabled={phase === "submitting"}>
        {phase === "submitting" ? "جارٍ الإرسال…" : "تسليم الاختبار"}
      </Button>
    </div>
  );
}
