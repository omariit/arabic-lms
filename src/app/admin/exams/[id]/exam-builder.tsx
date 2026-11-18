"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Input, Label, Select, Textarea } from "@/components/ui/primitives";

type Question = { id: string; text: string; type: string; options: string[]; correctIndex: number; position: number };

/** Question editor for MCQ / True-False exams (server stores correctIndex securely). */
export function ExamBuilder() {
  const params = useParams<{ id: string }>();
  const examId = params.id;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [type, setType] = useState("MCQ");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);

  const load = async () => {
    setBusy(true);
    try {
      // Question list is exposed through the exams list enriched with questions.
      const res = await fetch("/api/admin/exams");
      const data = await res.json();
      const exam = (data.exams ?? []).find((x: { id: string; questions?: Question[] }) => x.id === examId);
      setQuestions(exam?.questions ?? []);
      setLoaded(true);
    } finally { setBusy(false); }
  };

  if (!loaded) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "تحميل الأسئلة"}</Button>;
  }

  const optionCount = type === "TRUE_FALSE" ? 2 : 4;

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/admin/questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId, text, type,
          options: type === "TRUE_FALSE" ? ["صح", "خطأ"] : options.slice(0, optionCount).map(String),
          correctIndex: Math.min(correctIndex, optionCount - 1),
        }),
      });
      setText("");
      setOptions(["", "", "", ""]);
      setCorrectIndex(0);
      await load();
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
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

      {questions.map((q, i) => (
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
    </div>
  );
}
