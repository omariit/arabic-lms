"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn, formatSeconds } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Protected YouTube player:
 * - Loads the IFrame API into a custom wrapper div (NOT a bare iframe embed).
 * - Custom controls: play/pause, seek, speed, volume, custom fullscreen on the wrapper.
 * - Transparent pointer-events overlay blocks right-click / context menu on the iframe.
 * - Moving watermark (full name + phone) repositioned every 8 seconds.
 * - MutationObserver: any DOM tampering with the watermark destroys the player
 *   and logs a WATERMARK_TAMPER SecurityViolation.
 */

type YTPlayer = {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allow: boolean): void;
  getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
  setVolume(v: number): void; getVolume(): number;
  setPlaybackRate(r: number): void; getAvailablePlaybackRates(): number[];
  destroy(): void; mute(): void; unMute(): void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: {
        videoId: string; playerVars?: Record<string, string | number>;
        events?: { onReady?: (e: { target: YTPlayer }) => void };
      }) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoading: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoading) return apiLoading;
  apiLoading = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiLoading;
}

export type ProtectedPlayerProps = {
  lessonId?: string;
  liveSessionId?: string;
  studentName: string;
  studentPhone: string;
  isLive?: boolean;
  onEnded?: () => void;
  className?: string;
};

export function ProtectedPlayer({ lessonId, liveSessionId, studentName, studentPhone, isLive, onEnded, className }: ProtectedPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const watermarkRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const destroyLock = useRef(false);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [rate, setRate] = useState(1);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const logViolation = useCallback((detail: string) => {
    fetch("/api/security/violation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "WATERMARK_TAMPER", detail }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  /** Kill the player hard when tampering is detected. */
  const destroyPlayer = useCallback(
    (reason: string) => {
      if (destroyLock.current) return;
      destroyLock.current = true;
      logViolation(reason);
      try { playerRef.current?.destroy(); } catch { /* already gone */ }
      playerRef.current = null;
      if (playerHostRef.current) playerHostRef.current.innerHTML = "";
      setFatalError("تم إيقاف التشغيل: تم اكتشاف محاولة عبث في طبقة الحماية.");
    },
    [logViolation]
  );

  // 1. Fetch the short-lived grant, exchange it for the video source, mount the player.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const tokenRes = await fetch("/api/video/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(liveSessionId ? { liveSessionId } : { lessonId }),
        });
        if (!tokenRes.ok) throw new Error((await tokenRes.json().catch(() => ({}))).error ?? "تعذّر التحقق من صلاحية الدرس");
        const { grant } = (await tokenRes.json()) as { grant: string };

        const playRes = await fetch("/api/video/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grant }),
        });
        if (!playRes.ok) throw new Error((await playRes.json().catch(() => ({}))).error ?? "انتهت صلاحية رمز التشغيل");
        const { source } = (await playRes.json()) as { source: { videoId: string } };
        if (cancelled || !playerHostRef.current) return;

        await loadYouTubeApi();
        if (cancelled || !window.YT) return;

        playerRef.current = new window.YT.Player(playerHostRef.current, {
          videoId: source.videoId,
          playerVars: {
            controls: 0, // custom controls only
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            fs: 0, // native fullscreen disabled — we implement custom fullscreen on the wrapper
            playsinline: 1,
            iv_load_policy: 3,
          },
          events: {
            onReady: ({ target }) => {
              if (cancelled) return;
              setReady(true);
              setDuration(target.getDuration());
              target.setVolume(volume);
              timer = setInterval(() => {
                const p = playerRef.current;
                if (!p) return;
                setCurrentTime(p.getCurrentTime());
                const d = p.getDuration();
                if (d > 0) setDuration(d);
                const st = p.getPlayerState();
                setPlaying(st === 1);
                if (!isLive && d > 0 && st === 0) onEnded?.();
              }, 500);
            },
          },
        });
      } catch (e) {
        if (!cancelled) setFatalError(e instanceof Error ? e.message : "خطأ غير متوقع");
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      try { playerRef.current?.destroy(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, liveSessionId, isLive]);

  // 2. Moving watermark: random coordinates every 8 seconds.
  useEffect(() => {
    if (fatalError) return;
    let alive = true;
    const move = () => {
      const wm = watermarkRef.current;
      const wrapper = wrapperRef.current;
      if (!wm || !wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const wmW = wm.offsetWidth || 160;
      const wmH = wm.offsetHeight || 22;
      const x = Math.random() * Math.max(1, rect.width - wmW - 8) + 4;
      const y = Math.random() * Math.max(1, rect.height - wmH - 8) + 4;
      wm.style.left = `${x}px`;
      wm.style.top = `${y}px`;
      wm.style.right = "auto";
      wm.style.bottom = "auto";
    };
    move();
    const id = setInterval(move, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [fatalError, ready]);

  // 3. MutationObserver: watch the watermark strictly for removal/hiding/modification.
  useEffect(() => {
    if (fatalError || !ready) return;
    const wrapper = wrapperRef.current;
    const wm = watermarkRef.current;
    if (!wrapper || !wm) return;

    const observer = new MutationObserver(() => {
      const node = watermarkRef.current;
      if (!node) {
        destroyPlayer("WATERMARK_REMOVED");
        return;
      }
      const cs = getComputedStyle(node);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) {
        destroyPlayer("WATERMARK_HIDDEN");
        return;
      }
    });
    observer.observe(wrapper, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
    return () => observer.disconnect();
  }, [ready, fatalError, destroyPlayer]);

  // 4. Fullscreen state listener (custom fullscreen happens on the wrapper).
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (fatalError) {
    return (
      <div className={cn("player-wrapper relative flex aspect-video w-full items-center justify-center rounded-2xl bg-red-950 text-center text-white", className)}>
        <div className="p-6">
          <p className="text-lg font-extrabold">🔒 تم إيقاف المشغل</p>
          <p className="mt-2 text-sm text-red-200">{fatalError}</p>
        </div>
      </div>
    );
  }

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    playing ? p.pauseVideo() : p.playVideo();
  };

  const toggleFullscreen = async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    // CRITICAL: requestFullscreen on the parent wrapper div, never on the iframe,
    // so the watermark + custom controls stay visible in fullscreen.
    if (document.fullscreenElement) await document.exitFullscreen();
    else await wrapper.requestFullscreen().catch(() => {});
  };

  const seek = (ratio: number) => {
    const p = playerRef.current;
    if (!p || isLive || duration <= 0) return;
    p.seekTo(duration * ratio, true);
  };

  const changeRate = () => {
    const p = playerRef.current;
    if (!p) return;
    const rates = p.getAvailablePlaybackRates?.() ?? [0.5, 1, 1.25, 1.5, 2];
    const idx = rates.indexOf(rate);
    const next = rates[(idx + 1) % rates.length] ?? 1;
    p.setPlaybackRate(next);
    setRate(next);
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    playerRef.current?.setVolume(v);
  };

  return (
    <div
      ref={wrapperRef}
      dir="ltr"
      className={cn(
        "player-wrapper relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg",
        className
      )}
    >
      {/* YouTube IFrame API mounts inside this host div */}
      <div ref={playerHostRef} className="absolute inset-0" />

      {/* Transparent anti-click shield: blocks right-click, "Copy video URL", "Watch on YouTube" */}
      <div
        dir="ltr"
        className="absolute inset-0 z-20"
        style={{ pointerEvents: "auto" }}
        onContextMenu={(e) => { e.preventDefault(); logViolation("CONTEXT_MENU_BLOCKED"); }}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        aria-label="حماية الفيديو"
      />

      {/* Moving tamper-proof watermark: student name + phone, repositioned every 8s */}
      <div
        ref={watermarkRef}
        className="watermark-node"
        data-testid="watermark"
        style={{
          left: 8,
          top: 8,
          fontSize: "clamp(10px, 2.5vw, 14px)",
          textShadow: "0 1px 3px rgba(0,0,0,.9)",
          color: "rgba(255,255,255,.85)",
          background: "rgba(0,0,0,.25)",
          borderRadius: 6,
          padding: "2px 8px",
          fontFamily: "var(--font-cairo), sans-serif",
        }}
      >
        {studentName} • {studentPhone}
      </div>

      {/* Custom controls bar */}
      <div
        dir="rtl"
        className={cn(
          "absolute inset-x-0 bottom-0 z-40 flex items-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-6",
          fullscreen ? "opacity-100" : "opacity-100"
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Button size="icon" variant="ghost" className="text-white hover:bg-white/20" onClick={togglePlay} aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}>
          {playing ? "⏸" : "▶"}
        </Button>
        {!isLive && (
          <div className="relative h-2 flex-1 cursor-pointer rounded-full bg-white/25" onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            // RTL page, but the seek bar reads left-to-right inside dir="ltr" wrapper
            const ratio = (e.clientX - rect.left) / rect.width;
            seek(1 - ratio);
          }}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand-400" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
          </div>
        )}
        {isLive && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">● مباشر</span>}
        <span className="hidden text-xs text-white/80 sm:block">
          {isLive ? "بث حي" : `${formatSeconds(Math.floor(currentTime))} / ${formatSeconds(Math.floor(duration))}`}
        </span>
        <select
          aria-label="سرعة التشغيل"
          value={rate}
          onChange={(e) => {
            const r = Number(e.target.value);
            playerRef.current?.setPlaybackRate(r);
            setRate(r);
          }}
          className="h-8 rounded bg-white/15 px-1 text-xs text-white outline-none"
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
            <option key={r} value={r} className="text-black">{r}x</option>
          ))}
        </select>
        <div className="hidden items-center gap-1 sm:flex">
          <span className="text-xs text-white/80">🔊</span>
          <input type="range" min={0} max={100} value={volume} onChange={(e) => changeVolume(Number(e.target.value))} className="w-16 accent-brand-400" aria-label="مستوى الصوت" />
        </div>
        <Button size="icon" variant="ghost" className="text-white hover:bg-white/20" onClick={toggleFullscreen} aria-label="شاشة كاملة">
          {fullscreen ? "⤡" : "⛶"}
        </Button>
      </div>
    </div>
  );
}
