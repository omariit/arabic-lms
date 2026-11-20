"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Select, Label, Badge } from "@/components/ui/primitives";

/**
 * Live launcher with two modes:
 *  • حصة داخلية (MEETING): our own video meeting — video, voice, screen share,
 *    hand raise, host moderation, public invite link. Works without YouTube.
 *  • يوتيوب (CLASSROOM): unlisted YouTube broadcast + audio room (classic flow).
 */
export function OneClickLauncher({ youtubeConnected }: { youtubeConnected: boolean }) {
  const [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [busy, setBusy] = useState(false);

  const [meeting, setMeeting] = useState<{ liveSessionId: string; classroomUrl: string; inviteUrl: string } | null>(null);
  const [yt, setYt] = useState<{ liveSessionId: string; youtubeAppUrl: string; classroomUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load her courses immediately so the meeting button is one tap away.
  useEffect(() => { void loadCourses(); }, []);

  const loadCourses = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/courses");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? `تعذّر تحميل الدورات (${res.status})`);
      setCourses(Array.isArray(data.courses) ? data.courses : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الدورات");
    } finally {
      setLoaded(true);
      setBusy(false);
    }
  };

  const startMeeting = async () => {
    if (!courseId) { setError("اختاري الدورة أولًا"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/live/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذّر إنشاء الحصة");
      setMeeting({ liveSessionId: data.liveSessionId, classroomUrl: data.classroomUrl, inviteUrl: data.inviteUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally { setBusy(false); }
  };

  const startYoutube = async () => {
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
      setYt({ liveSessionId: data.liveSessionId, youtubeAppUrl: data.youtubeAppUrl, classroomUrl: data.classroomUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally { setBusy(false); }
  };

  const inviteFull = meeting ? `${window.location.origin}${meeting.inviteUrl}` : "";

  return (
    <Card className="border-red-200">
      <CardContent>
        <h2 className="mb-1 text-lg font-extrabold text-red-700">🔴 الحصة المباشرة</h2>
        <p className="mb-3 text-xs text-red-900/60">حصة داخلية بالفيديو والصوت داخل المنصة — أو بث يوتيوب.</p>

        {!loaded || (loaded && courses.length === 0) ? (
          <div className="space-y-3">
            <Button size="lg" className="w-full" variant="outline" onClick={loadCourses} disabled={busy}>
              {busy ? "…" : "عرض دوراتي"}
            </Button>
            {loaded && courses.length === 0 && !error && (
              <p className="text-center text-xs text-gray-500">
                ما عندك دورات بعد — <Link href="/admin/courses" className="font-bold text-brand-600 underline">أنشئي دورة</Link> ثم افتحي حصة لها.
              </p>
            )}
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
          </div>
        ) : !meeting && !yt ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="liveCourse">الدورة</Label>
              <Select id="liveCourse" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">— اختاري الدورة —</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </div>

            <Button size="lg" className="w-full text-base" onClick={startMeeting} disabled={busy}>
              🎥 {busy ? "جارٍ التحضير…" : "ابدئي حصة داخلية (فيديو + صوت)"}
            </Button>
            <p className="text-center text-[11px] text-gray-500">
              بدون يوتيوب — كاميرا وميكروفون وشاشة، مع رفع اليد وطلب الإذن ودعوة عامة لغير المسجّلات.
            </p>

            <div className="border-t border-brand-100 pt-3">
              <Button size="lg" variant="destructive" className="w-full" onClick={startYoutube} disabled={busy || !youtubeConnected}>
                ▶️ بث يوتيوب (يحتاج ربط القناة)
              </Button>
              {!youtubeConnected && (
                <p className="mt-1 text-center text-[11px] text-gray-500">
                  غير مرتبط — <Link href="/admin/profile" className="font-bold text-brand-600 underline">اربطي القناة</Link>
                </p>
              )}
            </div>

            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
          </div>
        ) : meeting ? (
          <div className="space-y-3">
            <p className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-800">
              ✓ الحصة الداخلية جاهزة — الطالبات المسجّلات يمكنهن الدخول الآن
            </p>
            <Link href={meeting.classroomUrl} className="block">
              <Button size="lg" className="w-full text-lg">🎬 دخول غرفة الحصة</Button>
            </Link>
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="text-[11px] font-extrabold text-brand-900">🔗 دعوة عامة (لغير المسجّلات)</p>
              <div className="mt-1.5 flex gap-1.5">
                <input readOnly value={inviteFull} dir="ltr" className="min-w-0 flex-1 rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-[10px]" />
                <Button size="sm" onClick={() => { navigator.clipboard.writeText(inviteFull); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? "✓" : "نسخ"}
                </Button>
              </div>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`دعوة لحضور حصة مباشرة: ${inviteFull}`)}`}
                target="_blank" rel="noopener noreferrer" className="mt-1.5 block"
              >
                <Button size="sm" className="w-full bg-[#25D366] hover:bg-[#1ebe57]">💬 إرسال الدعوة على واتساب</Button>
              </a>
              <p className="mt-1 text-[10px] text-brand-900/55">الضيفة تكتب اسمها ثم تنتظر موافقتك من قائمة «طلبات الدخول».</p>
            </div>
            <Badge tone="green">الحصة مسجّلة الحضور تلقائيًا للطالبات</Badge>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm font-bold text-emerald-700">✓ تم إنشاء البث وفتح الصف</p>
            <a href={yt!.youtubeAppUrl} className="block">
              <Button size="lg" variant="destructive" className="w-full text-lg">📲 افتحي يوتيوب وابدئي البث</Button>
            </a>
            <Link href={yt!.classroomUrl} className="block">
              <Button size="lg" className="w-full">👩‍🏫 دخول غرفة الفصل الصوتية</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
