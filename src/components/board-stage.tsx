"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadPages, type Page } from "@/lib/board-pages";

/**
 * لوحة الشرح — the recording surface of the teaching studio.
 *
 * Everything the students will see is painted on ONE canvas: the opened file
 * (PDF / image / Word / PowerPoint), the shared screen, and the teacher's pen,
 * highlighter and shapes. The canvas is the video source (`captureStream`), so:
 *   • the toolbar lives in the page, never inside the canvas → tools are never recorded;
 *   • one button hides every control for a clean presentation;
 *   • no screen-sharing permission is needed for files (works on iPhone/iPad).
 */

type Tool = "move" | "pen" | "highlight" | "line" | "arrow" | "rect" | "ellipse" | "erase";

type Point = { x: number; y: number };
type Stroke = { tool: Tool; color: string; width: number; points: Point[] };

const COLORS = ["#ffd54a", "#ff5252", "#40c4ff", "#69f0ae", "#ffffff", "#111827"];
const WIDTHS = [4, 8, 16];

const W = 1280;
const H = 720;

const TOOLS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: "move", label: "تحريك", icon: "✋" },
  { id: "pen", label: "قلم", icon: "✏️" },
  { id: "highlight", label: "تظليل", icon: "🖍" },
  { id: "line", label: "خط", icon: "➖" },
  { id: "arrow", label: "سهم", icon: "➡️" },
  { id: "rect", label: "مستطيل", icon: "▭" },
  { id: "ellipse", label: "دائرة", icon: "◯" },
  { id: "erase", label: "تراجع", icon: "↩️" },
];

export function BoardStage({
  onStream,
  screenStream,
  onPages,
  compact,
}: {
  onStream: (stream: MediaStream | null) => void;
  /** When present, the board shows the live screen instead of a file. */
  screenStream?: MediaStream | null;
  onPages?: (n: number) => void;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onStreamRef = useRef(onStream);
  onStreamRef.current = onStream;

  const pagesRef = useRef<Page[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const draftRef = useRef<Stroke | null>(null);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [showTools, setShowTools] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);

  const state = useRef({ pageIndex, zoom, pan, tool, color, width });
  state.current = { pageIndex, zoom, pan, tool, color, width };

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.fillStyle = "#0b1f19";
    ctx.fillRect(0, 0, W, H);

    const { pageIndex: i, zoom: z, pan: p } = state.current;
    const video = videoRef.current;
    const page = pagesRef.current[i];

    if (video && video.readyState >= 2) {
      // Shared screen: fill the frame, no distortion.
      const vw = video.videoWidth || 16;
      const vh = video.videoHeight || 9;
      const scale = Math.max(W / vw, H / vh) * z;
      const dw = vw * scale;
      const dh = vh * scale;
      ctx.drawImage(video, (W - dw) / 2 + p.x, (H - dh) / 2 + p.y, dw, dh);
    } else if (page) {
      const img = page.canvas;
      const base = Math.min(W / img.width, H / img.height);
      const dw = img.width * base * z;
      const dh = img.height * base * z;
      const dx = (W - dw) / 2 + p.x;
      const dy = (H - dh) / 2 + p.y;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 26;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(dx, dy, dw, dh);
      ctx.restore();
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "bold 38px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("أضيفي ملفًا (PDF · صورة · Word · PowerPoint) أو شاركي الشاشة", W / 2, H / 2);
      ctx.textAlign = "start";
    }

    for (const stroke of [...strokesRef.current, ...(draftRef.current ? [draftRef.current] : [])]) {
      drawStroke(ctx, stroke);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(paint, 1000 / 30);
    return () => window.clearInterval(id);
  }, [paint]);

  // The canvas stream is created once; the studio records it directly.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stream = canvas.captureStream(30);
    onStreamRef.current(stream);
    return () => {
      stream.getTracks().forEach((t) => t.stop());
      onStreamRef.current(null);
    };
  }, []);

  // Screen sharing: feed the display stream into a hidden <video> we draw from.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = screenStream ?? null;
    if (screenStream) void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [screenStream]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const collected: Page[] = [];
    for (const file of Array.from(files)) {
      setBusy(`جارٍ تجهيز ${file.name}…`);
      const result = await loadPages(file);
      if (result.error) setError(result.error);
      collected.push(...result.pages);
    }
    setBusy(null);
    if (!collected.length) return;
    pagesRef.current = [...pagesRef.current, ...collected];
    setPageCount(pagesRef.current.length);
    onPages?.(pagesRef.current.length);
    setPageIndex(pagesRef.current.length - collected.length);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const goto = (i: number) => {
    if (!pagesRef.current.length) return;
    setPageIndex(Math.max(0, Math.min(pagesRef.current.length - 1, i)));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const drawingRef = useRef<{ start: Point; panX: number; panY: number } | null>(null);

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    const t = state.current.tool;

    if (t === "erase") {
      strokesRef.current.pop();
      setStrokeCount(strokesRef.current.length);
      return;
    }
    if (t === "move") {
      drawingRef.current = { start: p, panX: pan.x, panY: pan.y };
      return;
    }
    drawingRef.current = { start: p, panX: pan.x, panY: pan.y };
    draftRef.current = { tool: t, color: t === "highlight" ? "#ffe14d" : color, width, points: [p] };
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = drawingRef.current;
    if (!drag) return;
    const p = point(e);
    if (state.current.tool === "move") {
      setPan({ x: drag.panX + (p.x - drag.start.x), y: drag.panY + (p.y - drag.start.y) });
      return;
    }
    const draft = draftRef.current;
    if (!draft) return;
    if (draft.tool === "pen" || draft.tool === "highlight") draft.points.push(p);
    else draft.points = [draft.points[0], p];
  };

  const up = () => {
    if (draftRef.current) {
      strokesRef.current.push(draftRef.current);
      draftRef.current = null;
      setStrokeCount(strokesRef.current.length);
    }
    drawingRef.current = null;
  };

  const canRecord = pageCount > 0 || Boolean(screenStream);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-[#0b1f19] ring-1 ring-black/30">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          data-testid="board-canvas"
          className="block w-full touch-none select-none"
          style={{ cursor: tool === "move" ? "grab" : tool === "erase" ? "not-allowed" : "crosshair" }}
        />
        <video ref={videoRef} muted playsInline className="hidden" />

        {/* Controls shown/hidden with one tap — they are DOM, so never recorded. */}
        <button
          type="button"
          onClick={() => setShowTools((v) => !v)}
          title={showTools ? "إخفاء الأدوات" : "إظهار الأدوات"}
          data-testid="board-toggle-tools"
          className="absolute left-2 top-2 z-10 flex h-9 items-center gap-1 rounded-lg bg-black/60 px-3 text-[11px] font-extrabold text-white backdrop-blur"
        >
          {showTools ? "🙈 إخفاء الأدوات" : "👁 الأدوات"}
        </button>

        {pageCount > 0 && (
          <span
            data-testid="board-page-badge"
            className="absolute right-2 top-2 z-10 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-extrabold text-white"
          >
            {pageIndex + 1} / {pageCount}
          </span>
        )}

        {busy && (
          <div className="absolute inset-x-0 bottom-0 z-10 bg-black/70 px-3 py-2 text-center text-[11px] font-bold text-amber-300">
            {busy}
          </div>
        )}
      </div>

      {showTools && (
        <div className="space-y-2 rounded-2xl border border-brand-100 bg-white p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-extrabold text-white">
              📄 ملف
              <input
                type="file"
                multiple
                accept="application/pdf,image/*,.docx,.pptx"
                className="hidden"
                data-testid="board-file-input"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <div className="flex items-center gap-1 rounded-xl bg-brand-50 p-1">
              <button type="button" onClick={() => goto(pageIndex - 1)} disabled={pageIndex === 0} className="h-8 rounded-lg px-2 text-xs font-extrabold text-brand-900 disabled:opacity-30">◀</button>
              <span className="min-w-12 text-center text-[11px] font-bold" dir="ltr">{pageCount ? `${pageIndex + 1}/${pageCount}` : "—"}</span>
              <button type="button" onClick={() => goto(pageIndex + 1)} disabled={pageIndex >= pageCount - 1} className="h-8 rounded-lg px-2 text-xs font-extrabold text-brand-900 disabled:opacity-30">▶</button>
            </div>

            <div className="flex items-center gap-1 rounded-xl bg-brand-50 p-1">
              <button type="button" onClick={() => setZoom((z) => Math.min(5, +(z + 0.2).toFixed(2)))} className="h-8 w-8 rounded-lg text-sm font-extrabold text-brand-900">＋</button>
              <span className="min-w-10 text-center text-[11px] font-bold" dir="ltr">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(2)))} className="h-8 w-8 rounded-lg text-sm font-extrabold text-brand-900">－</button>
              <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="h-8 rounded-lg px-2 text-[11px] font-extrabold text-brand-900">توسيط</button>
            </div>

            <button
              type="button"
              onClick={() => { strokesRef.current = []; setStrokeCount(0); }}
              className="h-10 rounded-xl bg-brand-50 px-3 text-xs font-extrabold text-brand-900 ring-1 ring-brand-200"
            >
              🧽 مسح الكل {strokeCount > 0 && <span data-testid="board-strokes">{strokeCount}</span>}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                data-testid={`board-tool-${t.id}`}
                className={`inline-flex h-10 items-center gap-1 rounded-xl px-2.5 text-xs font-extrabold transition ${
                  tool === t.id ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-900 ring-1 ring-brand-200"
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {tool !== "move" && tool !== "erase" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`لون ${c}`}
                    className={`h-7 w-7 rounded-full ring-2 ${color === c ? "ring-brand-700" : "ring-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1">
                {WIDTHS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWidth(w)}
                    className={`flex h-8 items-center justify-center rounded-lg px-2 ${width === w ? "bg-brand-700" : "bg-brand-50 ring-1 ring-brand-200"}`}
                    aria-label={`سمك ${w}`}
                  >
                    <span className={`block rounded-full ${width === w ? "bg-white" : "bg-brand-800"}`} style={{ width: w + 4, height: w + 4 }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {!compact && (
            <p className="text-[11px] leading-5 text-brand-900/60">
              اسحبي للتحريك، اختاري القلم أو التظليل أو الأشكال للشرح. الأدوات لا تظهر في التسجيل — وأي وقت
              يمكنك إخفاؤها بزر «إخفاء الأدوات».
            </p>
          )}
        </div>
      )}

      {error && <p className="rounded-xl bg-amber-50 p-2.5 text-[11px] font-bold text-amber-900">{error}</p>}
      {!canRecord && (
        <p className="text-[11px] font-bold text-amber-700">أضيفي ملفًا أو شاركي الشاشة قبل بدء التسجيل.</p>
      )}
    </div>
  );
}

/** Pen / highlighter / shapes, drawn identically live and in the recording. */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { tool, color, width, points } = stroke;
  if (!points.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (tool === "pen") {
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  } else if (tool === "highlight") {
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = width * 3.4;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  } else {
    const a = points[0];
    const b = points[points.length - 1];
    ctx.lineWidth = width;
    if (tool === "line") {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (tool === "arrow") {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const head = Math.max(18, width * 3);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 7), b.y - head * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 7), b.y - head * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    } else if (tool === "rect") {
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (tool === "ellipse") {
      ctx.beginPath();
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
