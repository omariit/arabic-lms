"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BoardStage } from "@/components/board-stage";
import { Card, CardContent, Label, Select, Input } from "@/components/ui/primitives";
import { cn, formatSeconds } from "@/lib/utils";

/**
 * Teaching Studio — the teacher opens this page, records her screen or camera with
 * her microphone, and the video is streamed to the recording service in chunks.
 *
 * Design rules:
 *  • The browser never holds the whole lesson: 4-second chunks go straight to the
 *    recording service (`NEXT_PUBLIC_RECORDING_SERVICE_URL`), not through the app.
 *  • Every chunk is retried with backoff and survives a dropped connection; the
 *    queue keeps the recording alive while the network is down.
 *  • Nothing is "done" until the service reports READY, and the teacher sees the
 *    real health (uploaded chunks, stage, progress, error) all the way.
 */

type Course = { id: string; title: string; modules: Array<{ id: string; title: string; lessons: Array<{ id: string; title: string }> }> };
type Rec = {
  id: string; title: string; status: string; stage: string; progress: number; chunkCount: number;
  durationSec: number | null; sizeBytes: number | null; hasVideo: boolean; error: string | null;
  lessonId: string | null; videoUrl: string | null; thumbnailUrl: string | null;
};

/**
 * Resolved at runtime from the server component, with the build-time public var
 * as a fallback: `next build` inside Docker only inlines NEXT_PUBLIC_* when the
 * builder receives it as a build arg, so the server value is the reliable one.
 */
const BUILD_TIME_SERVICE_URL = (process.env.NEXT_PUBLIC_RECORDING_SERVICE_URL ?? "").replace(/\/+$/, "");
const STORAGE_KEY = "muqriaa:studio:session";
const CHUNK_MS = 4000;
const MAX_RETRIES = 6;

const STAGE_LABEL: Record<string, string> = {
  created: "تم إنشاء الجلسة",
  receiving: "استلام المقاطع",
  queued: "في الانتظار",
  starting: "بدء المعالجة",
  probe: "فحص الملف",
  normalize: "تطبيع المقاطع",
  transcode: "تحويل إلى MP4",
  concat: "دمج المقاطع",
  thumbnail: "إنشاء الصورة المصغرة",
  ready: "جاهز",
  failed: "فشل",
  aborted: "أُلغي",
};

export function Studio({ canUseService, serviceUrl }: { canUseService: boolean; serviceUrl?: string }) {
  const serviceUrlRef = useRef((serviceUrl || BUILD_TIME_SERVICE_URL).replace(/\/+$/, ""));
  serviceUrlRef.current = (serviceUrl || BUILD_TIME_SERVICE_URL).replace(/\/+$/, "");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<"board" | "screen" | "camera">("board");
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const slideStreamRef = useRef<MediaStream | null>(null);
  const handleSlideStream = useCallback((stream: MediaStream | null) => {
    slideStreamRef.current = stream;
  }, []);

  const [boardPages, setBoardPages] = useState(0);
  const boardReady = boardPages > 0;
  const [withMic, setWithMic] = useState(true);

  const [phase, setPhase] = useState<"idle" | "starting" | "recording" | "paused" | "finishing" | "processing" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ id: string; uploadToken: string } | null>(null);
  const [recording, setRecording] = useState<Rec | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [upload, setUpload] = useState({ sent: 0, queued: 0, failed: 0, bytes: 0 });
  const [online, setOnline] = useState(true);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [recoverable, setRecoverable] = useState<{ id: string; title: string; at: number } | null>(null);
  const [attachMsg, setAttachMsg] = useState("");
  // The recording service scales to zero when idle: the first start of the day has
  // to wake it. This is shown as progress, not as an error.
  const [waking, setWaking] = useState<{ active: boolean; seconds: number }>({ active: false, seconds: 0 });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<Array<{ index: number; blob: Blob; retries: number }>>([]);
  const nextIndexRef = useRef(0);
  const drainingRef = useRef(false);
  const sentRef = useRef(0);
  const bytesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const recorderStoppedRef = useRef<Promise<void> | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const lessons = useMemo(
    () => courses.find((c) => c.id === courseId)?.modules.flatMap((m) => m.lessons) ?? [],
    [courses, courseId],
  );

  // ── load courses + recover an unfinished session ──────────────
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/courses").catch(() => null);
      const data = res && res.ok ? await res.json().catch(() => null) : null;
      setCourses(Array.isArray(data?.courses) ? data.courses : []);
    })();

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { id: string; title: string; at: number };
        if (saved?.id) setRecoverable(saved);
      }
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const stopEverything = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current = null;
    for (const s of streamsRef.current) s.getTracks().forEach((t) => t.stop());
    streamsRef.current = [];
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setPreview(null);
  }, []);

  // ── chunk uploader (sequential, retrying, survives offline) ───
  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (queueRef.current.length) {
        const item = queueRef.current[0];
        const token = sessionTokenRef.current;
        if (!token || !serviceUrlRef.current) break;
        try {
          const res = await fetch(`${serviceUrlRef.current}/sessions/${sessionIdRef.current}/chunks/${item.index}`, {
            method: "PUT",
            headers: { "content-type": "application/octet-stream", authorization: `Bearer ${token}` },
            body: item.blob,
          });
          if (!res.ok) throw new Error(String(res.status));
          queueRef.current.shift();
          sentRef.current += 1;
          bytesRef.current += item.blob.size;
          setUpload({ sent: sentRef.current, queued: queueRef.current.length, failed: 0, bytes: bytesRef.current });
        } catch {
          item.retries += 1;
          setUpload({ sent: sentRef.current, queued: queueRef.current.length, failed: item.retries, bytes: bytesRef.current });
          // Never drop a chunk: the lesson is worth more than the retry count.
          // After a burst of failures we reset the counter and keep trying with a
          // slow cadence, so a 30-second network drop heals by itself.
          if (item.retries >= MAX_RETRIES) {
            item.retries = 0;
            await new Promise((r) => setTimeout(r, 5000));
          } else {
            // exponential backoff, capped — keeps a flaky 4G connection usable
            await new Promise((r) => setTimeout(r, Math.min(8000, 600 * item.retries)));
          }
        }
      }
    } finally {
      drainingRef.current = false;
    }
  }, []);

  // Safety net: if the queue ever stalls (network drop, service restart) this
  // brings it back without the teacher having to do anything.
  useEffect(() => {
    const t = setInterval(() => {
      if (queueRef.current.length && !drainingRef.current) void drain();
    }, 5000);
    return () => clearInterval(t);
  }, [drain]);

  /** Wake a slept recording service and wait until it answers (max ~75s). */
  const wakeService = useCallback(async () => {
    setWaking({ active: true, seconds: 0 });
    const t = setInterval(() => setWaking((w) => ({ ...w, seconds: w.seconds + 1 })), 1000);
    try {
      const res = await fetch("/api/admin/recordings/warm", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.awake) throw new Error(data?.error ?? "خدمة التسجيل لم تستجب");
    } finally {
      clearInterval(t);
      setWaking({ active: false, seconds: 0 });
    }
  }, []);

  // Warn about a stalled queue that is really a waking container, not a failure.
  useEffect(() => {
    if (upload.failed >= 3 && !waking.active) void wakeService().catch(() => {});
  }, [upload.failed, waking.active, wakeService]);

  // ── start ─────────────────────────────────────────────────────
  const start = async () => {
    setError(null);
    if (!canUseService) {
      setError("خدمة التسجيل غير مهيأة على الخادم بعد — راجعي docs/recording.md");
      return;
    }
    setPhase("starting");
    try {
      // Make sure a slept service is awake before we create the session, so the
      // teacher's first lesson of the day does not fail on a cold container.
      await wakeService();
      const chosen = lessons.find((l) => l.id === lessonId);
      const recTitle = title.trim() || chosen?.title || `تسجيل حصة — ${new Date().toLocaleDateString("ar-JO")}`;

      const created = await fetch("/api/admin/recordings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: recTitle, courseId: courseId || null, lessonId: lessonId || null }),
      });
      const createdData = await created.json().catch(() => null);
      if (!created.ok || !createdData?.id) throw new Error(createdData?.error ?? "تعذّر بدء الجلسة");

      sessionIdRef.current = createdData.id;
      sessionTokenRef.current = createdData.uploadToken;
      setSession({ id: createdData.id, uploadToken: createdData.uploadToken });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: createdData.id, title: recTitle, at: Date.now() }));
      } catch {
        /* ignore */
      }

      // media acquisition
      // Screen sharing feeds the board as well, so the teacher can annotate the
      // shared screen and the annotations end up inside the recording.
      const display =
        source === "screen"
          ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })
          : null;
      setScreenStream(display);
      const camStream =
        source === "camera"
          ? await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, frameRate: 30 }, audio: false })
          : null;

      // Board mode: the canvas IS the camera, so no screen-share permission is
      // needed (works on iPhone/iPad too).
      const boardStream = source === "camera" ? null : slideStreamRef.current;
      if (source === "board" && !boardStream) {
        throw new Error("أضيفي ملفًا واحدًا على الأقل في اللوحة قبل بدء التسجيل");
      }
      if (source === "screen" && display && !boardStream) {
        throw new Error("تعذّر تجهيز لوحة الشرح — أعيدي تحميل الصفحة ثم حاولي");
      }
      const videoStream = (boardStream ?? camStream)!;
      const micStream = withMic ? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) : null;
      streamsRef.current = [videoStream, micStream, display].filter(Boolean) as MediaStream[];

      // mix mic + (optional) shared-tab audio into ONE audio track
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      if (micStream) {
        const micSrc = ctx.createMediaStreamSource(micStream);
        const gain = ctx.createGain();
        gain.gain.value = 1;
        micSrc.connect(gain).connect(dest);
      }
      const sharedAudio = display?.getAudioTracks() ?? [];
      if (sharedAudio.length) {
        const sysSrc = ctx.createMediaStreamSource(new MediaStream(sharedAudio));
        const gain = ctx.createGain();
        gain.gain.value = 0.9;
        sysSrc.connect(gain).connect(dest);
      }

      const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
      if (withMic || sharedAudio.length) tracks.push(...dest.stream.getAudioTracks());
      const mixed = new MediaStream(tracks);
      setPreview(mixed);

      const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((m) =>
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
      );
      const recorder = new MediaRecorder(mixed, {
        ...(mime ? { mimeType: mime } : {}),
        // A board and a voice: 720p slides stay sharp at ~900 kbps, and 48 kbps mono is
        // transparent for speech. Smaller files = less client CPU, less volume, less egress.
        videoBitsPerSecond: 900_000,
        audioBitsPerSecond: 48_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        queueRef.current.push({ index: nextIndexRef.current++, blob: event.data, retries: 0 });
        setUpload((u) => ({ ...u, queued: queueRef.current.length }));
        void drain();
      };

      recorderStoppedRef.current = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      // stop the recorder if she ends the screen share from the browser bar
      videoStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state !== "inactive") void finish();
      });

      recorder.start(CHUNK_MS);
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 1000);
      setPhase("recording");
    } catch (e) {
      const message = e instanceof Error ? e.message : "تعذّر بدء التسجيل";
      setError(
        /Permission|NotAllowed/i.test(message)
          ? "لم يُسمح باستخدام الكاميرا/الشاشة أو المايكروفون — أعطي المتصفح الإذن ثم أعيدي المحاولة"
          : message,
      );
      setPhase("error");
      stopEverything();
      await cleanupSession().catch(() => {});
    }
  };

  const cleanupSession = async () => {
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    sessionTokenRef.current = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return id;
  };

  // ── pause / resume ────────────────────────────────────────────
  const togglePause = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setPhase("paused");
    } else if (rec.state === "paused") {
      rec.resume();
      setPhase("recording");
    }
  };

  // ── finish: flush the queue, finalize, then watch the pipeline ─
  const finish = async () => {
    if (phase === "finishing" || phase === "processing") return;
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      setError("لا يوجد تسجيل جارٍ");
      return;
    }
    setPhase("finishing");
    setError(null);
    rec.stop();
    await recorderStoppedRef.current;
    if (timerRef.current) clearInterval(timerRef.current);
    for (const s of streamsRef.current) s.getTracks().forEach((t) => t.stop());
    setPreview(null);

    // flush remaining chunks (a few seconds of buffer may still be queued)
    const deadline = Date.now() + 90_000;
    while (queueRef.current.length && Date.now() < deadline) {
      await drain();
      if (queueRef.current.length) await new Promise((r) => setTimeout(r, 800));
    }
    if (queueRef.current.length) {
      setError("بعض المقاطع لم تُرفع بعد — تحقّقي من الإنترنت ثم اضغطي «أنهي وأخرجي الفيديو» من لوحة التسجيلات");
      setPhase("error");
      return;
    }

    const id = sessionIdRef.current;
    if (!id) return;
    const res = await fetch(`/api/admin/recordings/${id}/finalize`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "تعذّر إنهاء التسجيل");
      setPhase("error");
      return;
    }
    setRecording(data.recording ?? null);
    setPhase("processing");
    void poll(id);
  };

  const poll = async (id: string) => {
    for (let i = 0; i < 400; i++) {
      const res = await fetch(`/api/admin/recordings/${id}`).catch(() => null);
      const data = res && res.ok ? await res.json().catch(() => null) : null;
      if (data?.recording) {
        setRecording(data.recording);
        if (data.recording.status === "READY") {
          setPhase("ready");
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            /* ignore */
          }
          return;
        }
        if (data.recording.status === "FAILED") {
          setError(data.recording.error ?? "فشل تجهيز الفيديو");
          setPhase("error");
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    setError("المعالجة تأخذ وقتًا أطول من المعتاد — تابعت من صفحة التسجيلات");
    setPhase("error");
  };

  // ── recovery: finalize what was already uploaded ──────────────
  const recover = async (mode: "finish" | "discard") => {
    const saved = recoverable;
    if (!saved) return;
    setRecoverable(null);
    if (mode === "discard") {
      await fetch(`/api/admin/recordings/${saved.id}/abort`, { method: "POST" }).catch(() => {});
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    sessionIdRef.current = saved.id;
    setPhase("processing");
    const res = await fetch(`/api/admin/recordings/${saved.id}/finalize`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "تعذّر استخراج الفيديو من المقاطع المرفوعة");
      setPhase("error");
      return;
    }
    setRecording(data.recording ?? null);
    poll(saved.id);
  };

  const attach = async (lesson: string) => {
    if (!recording) return;
    const res = await fetch(`/api/admin/recordings/${recording.id}/attach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId: lesson || null }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setAttachMsg(data?.error ?? "تعذّر الربط");
      return;
    }
    setRecording(data.recording);
    setAttachMsg(lesson ? `✓ رُبط بالدرس: ${data.lessonTitle ?? ""}` : "✓ أُلغي الربط");
  };

  const reset = () => {
    stopEverything();
    queueRef.current = [];
    nextIndexRef.current = 0;
    sentRef.current = 0;
    bytesRef.current = 0;
    setSession(null);
    setRecording(null);
    sessionIdRef.current = null;
    sessionTokenRef.current = null;
    setUpload({ sent: 0, queued: 0, failed: 0, bytes: 0 });
    setElapsed(0);
    setPhase("idle");
    setError(null);
    setAttachMsg("");
  };

  useEffect(() => () => stopEverything(), [stopEverything]);

  const fmtBytes = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} م.ب` : `${Math.round(b / 1024)} ك.ب`);

  return (
    <div className="space-y-4">
      {recoverable && (
        <Card className="border-2 border-amber-300 bg-amber-50">
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-extrabold text-emerald-950">🔄 لديك تسجيل لم يُنهَ: «{recoverable.title}»</p>
            <p className="text-xs text-emerald-900/70">
              المقاطع المرفوعة محفوظة على الخادم. يمكنك استخراج الفيديو منها الآن دون إعادة التسجيل.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => recover("finish")}>استخراج الفيديو من المقاطع المحفوظة</Button>
              <Button variant="outline" onClick={() => recover("discard")}>تجاهل وحذف</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!canUseService && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
          خدمة التسجيل غير مفعّلة على الخادم. أضيفي متغيّري <code>RECORDING_SERVICE_URL</code> و
          <code>RECORDING_SHARED_SECRET</code> ثم أعد النشر (docs/recording.md).
        </p>
      )}
      {!online && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
          انقطع الإنترنت — التسجيل يستمر محليًا، وستُرفع المقاطع تلقائيًا عند عودة الشبكة.
        </p>
      )}

      {phase === "idle" || phase === "starting" || phase === "error" ? (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="studio-course">الدورة</Label>
                <Select id="studio-course" value={courseId} onChange={(e) => { setCourseId(e.target.value); setLessonId(""); }}>
                  <option value="">— بدون دورة —</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="studio-lesson">الدرس (اختياري — لربط الفيديو بالدرس)</Label>
                <Select id="studio-lesson" value={lessonId} onChange={(e) => setLessonId(e.target.value)} disabled={!lessons.length}>
                  <option value="">— بدون ربط —</option>
                  {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="studio-title">عنوان التسجيل</Label>
              <Input id="studio-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: حصة التجويد — الأحد" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="studio-source">مصدر الصورة</Label>
                <Select
                  id="studio-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value as "board" | "screen" | "camera")}
                  disabled={phase !== "idle" && phase !== "error"}
                >
                  <option value="board">📄 ملف ولوحة الشرح (PDF · صورة · Word · PowerPoint)</option>
                  <option value="screen">🖥 مشاركة الشاشة + الشرح عليها</option>
                  <option value="camera">📷 الكاميرا</option>
                </Select>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm font-bold text-brand-900">
                <input type="checkbox" checked={withMic} onChange={(e) => setWithMic(e.target.checked)} className="h-4 w-4" />
                تسجيل المايكروفون (صوتك)
              </label>
            </div>

            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

            <Button
              size="lg"
              className="w-full text-base"
              onClick={start}
              disabled={phase === "starting" || waking.active || !canUseService || (source === "board" && !boardReady)}
            >
              {waking.active
                ? `⏳ نُجهّز خدمة التسجيل… ${waking.seconds}ث`
                : phase === "starting"
                  ? "جارٍ التحضير…"
                  : "🎬 ابدئي التسجيل"}
            </Button>
            {waking.active && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                خدمة التسجيل كانت نائمة لتوفير التكلفة، ونوقظها الآن — عادةً تستغرق ١٠–٣٠ ثانية، ولا يمكن أن يبدأ
                التسجيل قبل أن تجيب. لا تُغلقي الصفحة، وسيصلك تنبيه عند الجهوزية.
              </p>
            )}
            <p className="text-center text-[11px] text-gray-500">
              {source === "board"
                ? "أضيفي ملف الدرس في اللوحة بالأسفل (PDF أو صورة أو Word أو PowerPoint)، ثم ابدئي التسجيل — صوتك وشرحك على الملف يُسجَّلان معًا."
                : source === "screen"
                  ? "اختاري «الشاشة كاملة» أو «علامة تبويب» ثم اسمحي بالصوت — يمكنك الشرح بالقلم على الشاشة المشتركة، ويظهر ذلك في التسجيل."
                  : "الفيديو يُرفع أثناء التسجيل، لذلك لا يضيع منك درس بسبب انقطاع."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {source !== "camera" && ["idle", "error", "starting", "recording", "paused", "finishing"].includes(phase) && (
        <Card className="border-brand-200">
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-brand-950">
                {source === "screen" ? "🖥 الشاشة المشتركة + الشرح" : "📄 لوحة الشرح"}
              </p>
              {(phase === "recording" || phase === "paused") && (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-extrabold text-red-700">
                  تُسجَّل الآن — الأدوات لا تظهر في الفيديو
                </span>
              )}
            </div>
            <BoardStage
              onStream={handleSlideStream}
              screenStream={source === "screen" ? screenStream : null}
              onPages={(n) => setBoardPages(n)}
            />
          </CardContent>
        </Card>
      )}

      {(phase === "recording" || phase === "paused" || phase === "finishing") && (
        <Card className={cn("border-2", phase === "paused" ? "border-amber-300" : "border-red-300")} data-testid="recording-panel">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn("inline-block h-3 w-3 rounded-full", phase === "paused" ? "bg-amber-500" : "animate-pulse bg-red-600")} />
                <span className="text-sm font-extrabold text-brand-950">
                  {phase === "paused" ? "التسجيل موقوف مؤقتًا" : phase === "finishing" ? "جارٍ إنهاء التسجيل…" : "التسجيل جارٍ"}
                </span>
              </div>
              <span className="rounded-lg bg-brand-950 px-3 py-1 text-lg font-extrabold tabular-nums text-white" dir="ltr">
                {new Date(elapsed * 1000).toISOString().slice(11, 19)}
              </span>
            </div>

            {preview && (
              <video
                autoPlay
                muted
                playsInline
                className="aspect-video w-full rounded-2xl bg-black object-contain"
                ref={(el) => {
                  if (el && el.srcObject !== preview) el.srcObject = preview;
                }}
              />
            )}

            <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <div className="rounded-xl bg-brand-50 p-2">
                <p className="font-extrabold text-brand-900">{upload.sent}</p>
                <p className="text-[10px] text-brand-900/60">مقاطع مرفوعة</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-2">
                <p className="font-extrabold text-brand-900">{upload.queued}</p>
                <p className="text-[10px] text-brand-900/60">في الانتظار</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-2">
                <p className="font-extrabold text-brand-900">{fmtBytes(upload.bytes)}</p>
                <p className="text-[10px] text-brand-900/60">مرفوع للخادم</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-2">
                <p className={cn("font-extrabold", upload.failed ? "text-amber-700" : "text-brand-900")}>{upload.failed}</p>
                <p className="text-[10px] text-brand-900/60">محاولات إعادة</p>
              </div>
            </div>

            {upload.failed >= 3 && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-800">
                ⏳ خدمة التسجيل كانت نائمة ونوقظها — المقاطع محفوظة عندك وسيُستأنف رفعها تلقائيًا.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-12" onClick={togglePause} disabled={phase === "finishing"}>
                {phase === "paused" ? "▶ استئناف" : "⏸ إيقاف مؤقت"}
              </Button>
              <Button variant="destructive" className="h-12 flex-1 text-base" onClick={finish} disabled={phase === "finishing"} data-testid="stop-recording">
                {phase === "finishing" ? "جارٍ الإنهاء…" : "⏹ إيقاف التسجيل واستخراج الفيديو"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(phase === "recording" || phase === "paused" || phase === "finishing") && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-red-200 bg-white/95 px-3 py-2 shadow-[0_-6px_18px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <span className={cn("h-3 w-3 shrink-0 rounded-full", phase === "paused" ? "bg-amber-500" : "animate-pulse bg-red-600")} />
            <span className="rounded-lg bg-brand-950 px-2 py-0.5 text-sm font-extrabold tabular-nums text-white" dir="ltr">
              {new Date(elapsed * 1000).toISOString().slice(11, 19)}
            </span>
            <Button variant="outline" size="sm" className="h-10" onClick={togglePause} disabled={phase === "finishing"}>
              {phase === "paused" ? "▶" : "⏸"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-10 flex-1"
              onClick={finish}
              disabled={phase === "finishing"}
              data-testid="stop-recording-sticky"
            >
              {phase === "finishing" ? "جارٍ الإنهاء…" : "⏹ إيقاف التسجيل"}
            </Button>
          </div>
        </div>
      )}

      {(phase === "processing" || (recording && (recording.status === "PROCESSING" || recording.status === "UPLOADING"))) && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-extrabold text-brand-950">⚙️ تجهيز الفيديو</p>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-100">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.max(3, recording?.progress ?? 2)}%` }} />
            </div>
            <p className="text-xs text-brand-900/70">
              {STAGE_LABEL[recording?.stage ?? "queued"] ?? recording?.stage} — {recording?.progress ?? 0}%
            </p>
            <p className="text-[11px] text-gray-500">
              يمكنك إغلاق الصفحة: المعالجة تكتمل على الخادم، وسيصلك إشعار عند الجهوزية.
            </p>
          </CardContent>
        </Card>
      )}

      {phase === "ready" && recording && (
        <Card className="border-2 border-emerald-300">
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-extrabold text-emerald-800">✅ التسجيل جاهز</p>
            <video
              controls
              playsInline
              preload="metadata"
              poster={recording.thumbnailUrl ?? undefined}
              src={recording.videoUrl ?? undefined}
              className="aspect-video w-full rounded-2xl bg-black"
            />
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-emerald-50 p-2">
                <p className="font-extrabold text-emerald-900">{formatSeconds(recording.durationSec ?? 0)}</p>
                <p className="text-[10px] text-emerald-900/60">المدة</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-2">
                <p className="font-extrabold text-emerald-900">{fmtBytes(recording.sizeBytes ?? 0)}</p>
                <p className="text-[10px] text-emerald-900/60">الحجم</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-2">
                <p className="font-extrabold text-emerald-900">{recording.chunkCount}</p>
                <p className="text-[10px] text-emerald-900/60">مقاطع</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <a href={recording.videoUrl ?? "#"} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">▶ مشاهدة في نافذة</Button>
              </a>
              <a href={recording.videoUrl ?? "#"} download={`${recording.title}.mp4`}>
                <Button variant="outline">⬇ تنزيل</Button>
              </a>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}${recording.videoUrl}`);
                  setAttachMsg("✓ نُسخ رابط الفيديو");
                }}
              >
                🔗 نسخ الرابط
              </Button>
            </div>

            <div className="rounded-2xl border border-brand-100 p-3">
              <Label>ربط الفيديو بدرس (تظهر للطالبات داخل صفحة الدرس)</Label>
              <div className="mt-1 flex gap-2">
                <Select
                  value={recording.lessonId ?? ""}
                  onChange={(e) => attach(e.target.value)}
                  className="min-w-0 flex-1"
                >
                  <option value="">— بدون ربط —</option>
                  {courses.flatMap((c) => c.modules.flatMap((m) => m.lessons)).map((l) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </Select>
                <Link
                  href="/admin/recordings"
                  className="inline-flex h-11 items-center gap-1 rounded-xl border-2 border-brand-200 bg-white px-4 text-xs font-extrabold text-brand-900"
                >
                  📼 كل التسجيلات
                </Link>
              </div>
              {attachMsg && <p className="mt-1 text-xs font-bold text-brand-700">{attachMsg}</p>}
            </div>

            <Button size="lg" className="w-full" onClick={reset}>🎬 تسجيل حصة جديدة</Button>
          </CardContent>
        </Card>
      )}

      {phase === "error" && session && (
        <Card className="border-2 border-red-200">
          <CardContent className="space-y-2 py-4">
            <p className="text-sm font-extrabold text-red-700">توقّف التسجيل</p>
            <p className="text-xs text-red-900/70">
              المقاطع المرفوعة محفوظة. يمكنك استخراج الفيديو منها من صفحة التسجيلات، أو حذف الجلسة والبدء من جديد.
            </p>
            <div className="flex gap-2">
              <Link href="/admin/recordings"><Button variant="outline">لوحة التسجيلات</Button></Link>
              <Button variant="secondary" onClick={reset}>بدء من جديد</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-brand-50/50">
        <CardContent className="py-3 text-[11px] leading-6 text-brand-900/70">
          <p className="font-extrabold text-brand-900">كيف يعمل؟</p>
          <p>
            التسجيل يُقسَّم كل ٤ ثوانٍ ويُرفع مباشرة إلى خدمة التسجيل المستقلة (خارج سيرفر المنصة)، ثم يُحوَّل على
            الخادم إلى MP4 مع صورة مصغرة. لا يمرّ أي فيديو عبر سيرفر المنصة، ولا يُفقد التسجيل إذا انقطع الإنترنت.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
