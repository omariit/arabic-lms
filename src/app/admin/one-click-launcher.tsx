"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Select, Label, Badge } from "@/components/ui/primitives";

/**
 * One-Click Mobile Live Launcher (zero-tech UX):
 * Teacher picks a course, taps "ابدئي الحصة المباشرة الآن" — the backend creates
 * the Unlisted YouTube broadcast + stream via her stored OAuth token, saves it,
 * unlocks the classroom, and shows a single deep-link button to open her
 * YouTube app broadcast screen.
 */
export function OneClickLauncher({ youtubeConnected }: { youtubeConnected: boolean }) {
  const [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [loaded, setLoaded] = useState(youtubeConnected);
  const [courseId, setCourseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ liveSessionId: string; youtubeAppUrl: string; classroomUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!loaded) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-5 text-center">
          <p className="text-sm font-bold text-amber-800">📺 اربطي قناة يوتيوب أولًا لتشغيل الحصص المباشرة بضغطة واحدة</p>
          <Link href="/admin/profile" className="mt-3 inline-block text-sm font-bold text-brand-600 underline">الذهاب إلى الإعدادات</Link>
        </CardContent>
      </Card>
    );
  }

  const loadCourses = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/courses");
      const data = await res.json();
      setCourses(data.courses ?? []);
    } finally { setBusy(false); }
  };

  const startLive = async () => {
    if (!courseId) { setError("اختاري الدورة أولًا"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/live/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل بدء البث");
      setResult({ liveSessionId: data.liveSessionId, youtubeAppUrl: data.youtubeAppUrl, classroomUrl: data.classroomUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally { setBusy(false); }
  };

  return (
    <Card className="border-red-200">
      <CardContent>
        <h2 className="mb-3 text-lg font-extrabold text-red-700">🔴 الحصة المباشرة</h2>

        {courses.length === 0 ? (
          <Button size="lg" className="w-full" variant="outline" onClick={loadCourses} disabled={busy}>
            {busy ? "…" : "عرض دوراتي"}
          </Button>
        ) : !result ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="liveCourse">الدورة</Label>
              <Select id="liveCourse" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">— اختاري الدورة —</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </div>
            <Button size="lg" variant="destructive" className="w-full text-lg" onClick={startLive} disabled={busy}>
              {busy ? "جارٍ إنشاء البث على يوتيوب…" : "▶️ ابدئي الحصة المباشرة الآن"}
            </Button>
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm font-bold text-emerald-700">✓ تم إنشاء البث وفتح الصف — يوتيوب يسجّل مباشرة</p>
            {/* Single deep-link button: opens her YouTube app broadcast screen */}
            <a href={result.youtubeAppUrl} className="block">
              <Button size="lg" variant="destructive" className="w-full text-lg">
                📲 افتحي يوتيوب وابدئي البث
              </Button>
            </a>
            <Link href={result.classroomUrl} className="block">
              <Button size="lg" className="w-full">👩‍🏫 دخول غرفة الفصل الصوتية</Button>
            </Link>
            <Badge tone="green">الطلاب المسجلات في الدورة يمكنهن الانضمام الآن</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
