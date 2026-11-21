"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * «لوحة العرض» — the presentation stage for the teaching studio.
 *
 * Why it exists: recording used to depend on screen sharing, which is impossible
 * on iPhones and awkward on tablets. Here the teacher loads pictures (mushaf
 * pages, charts, photos of a book), then zooms, pans and writes on them with her
 * finger; the canvas itself is what gets recorded, so the video shows exactly
 * what the students will see.
 */
export function SlideStage({
  onStream,
  onCount,
}: {
  onStream: (stream: MediaStream | null) => void;
  onCount?: (n: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onStreamRef = useRef(onStream);
  onStreamRef.current = onStream;
  const imagesRef = useRef<HTMLImageElement[]>([]);

  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pen, setPen] = useState(false);
  const strokesRef = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const drawingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the newest values for the render loop without re-creating it.
  const view = useRef({ index: 0, zoom: 1, pan: { x: 0, y: 0 }, pen: false });
  view.current = { index, zoom, pan, pen };

  const W = 1280;
  const H = 720;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0f2e25";
    ctx.fillRect(0, 0, W, H);

    const img = imagesRef.current[view.current.index];
    if (img && img.complete && img.naturalWidth > 0) {
      const z = view.current.zoom;
      const base = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * base * z;
      const dh = img.naturalHeight * base * z;
      const dx = (W - dw) / 2 + view.current.pan.x;
      const dy = (H - dh) / 2 + view.current.pan.y;
      // soft shadow so the page stands out from the background
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 24;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(dx, dy, dw, dh);
      ctx.restore();
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "bold 40px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("أضيفي صورة لتبدئي الشرح عليها", W / 2, H / 2);
    }

    // annotations
    ctx.strokeStyle = "#ffd54a";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      ctx.beginPath();
      stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
  }, [H, W]);

  // 30fps redraw keeps the captured stream alive even while nothing changes.
  useEffect(() => {
    const id = window.setInterval(paint, 1000 / 24);
    return () => window.clearInterval(id);
  }, [paint]);

  // Publish the canvas as a video track for the recorder.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stream = canvas.captureStream(30);
    streamRef.current = stream;
    onStreamRef.current(stream);
    return () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      onStreamRef.current(null);
    };
  }, []);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const next: HTMLImageElement[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setError("الملفات المدعومة الآن صور (JPG/PNG/WebP). حوّلي صفحات PDF إلى صور.");
        continue;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => {});
      next.push(img);
    }
    if (!next.length) return;
    imagesRef.current = [...imagesRef.current, ...next];
    const total = imagesRef.current.length;
    setCount(total);
    onCount?.(total);
    setIndex((i) => (imagesRef.current.length > i ? i : total - 1));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const goto = (i: number) => {
    if (!imagesRef.current.length) return;
    const next = Math.max(0, Math.min(imagesRef.current.length - 1, i));
    setIndex(next);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Pointer maths: drawing when the pen is on, otherwise drag to pan.
  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointFromEvent(e);
    if (pen) {
      drawingRef.current = true;
      strokesRef.current.push([p]);
      return;
    }
    dragRef.current = { x: p.x, y: p.y, panX: pan.x, panY: pan.y };
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointFromEvent(e);
    if (drawingRef.current) {
      strokesRef.current[strokesRef.current.length - 1]?.push(p);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    setPan({ x: drag.panX + (p.x - drag.x), y: drag.panY + (p.y - drag.y) });
  };

  const up = () => {
    drawingRef.current = false;
    dragRef.current = null;
  };

  return (
    <div ref={wrapRef} className="space-y-2 rounded-2xl border border-brand-100 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-xl bg-brand-600 px-3 py-2 text-xs font-extrabold text-white">
          🖼️ إضافة صورة
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </label>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => goto(index - 1)} disabled={index === 0}>السابق</Button>
          <span className="min-w-14 text-center text-xs font-bold">{count ? `${index + 1} / ${count}` : "—"}</span>
          <Button size="sm" variant="outline" onClick={() => goto(index + 1)} disabled={index >= count - 1}>التالي</Button>
        </div>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}>➕</Button>
          <span className="min-w-10 text-center text-xs font-bold" dir="ltr">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.25).toFixed(2)))}>➖</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            توسيط
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setPen((v) => !v)}
          className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${pen ? "bg-amber-400 text-emerald-950" : "bg-brand-50 text-brand-800 ring-1 ring-brand-200"}`}
        >
          {pen ? "✏️ القلم مفعّل" : "✏️ تفعيل القلم"}
        </button>
        <button
          type="button"
          onClick={() => {
            strokesRef.current = [];
          }}
          className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-extrabold text-brand-800 ring-1 ring-brand-200"
        >
          🧽 مسح الرسم
        </button>
      </div>

      {error && <p className="rounded-lg bg-amber-50 p-2 text-[11px] font-bold text-amber-900">{error}</p>}

      <div className="relative overflow-hidden rounded-xl bg-brand-950">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="block w-full touch-none select-none"
          style={{ cursor: pen ? "crosshair" : "grab" }}
        />
      </div>
      <p className="text-[11px] leading-5 text-brand-900/60">
        اسحبي بإصبعك لتحريك الصفحة، وكبّري بالزرين، وفعّلي القلم للكتابة والشرح. كل ما يظهر هنا
        يُسجَّل داخل الفيديو كما هو.
      </p>
    </div>
  );
}
