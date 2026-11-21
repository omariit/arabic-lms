/**
 * Records a live meeting from the host's browser.
 *
 * The meeting is a WebRTC mesh: every participant's picture lives in its own
 * <video>. This class paints them into a single canvas (speaker-first grid), mixes
 * the audio tracks the host already has, and hands the recorder the same chunked
 * pipeline the studio uses — so the MP4 lands in «تسجيلات الحصص» and can be
 * attached to a lesson afterwards.
 *
 * Nothing goes through our server: chunks are PUT straight to the recording
 * service with the session token.
 */

export type RecorderState = {
  sent: number;
  queued: number;
  failed: number;
  bytes: number;
};

type Args = {
  serviceUrl: string;
  sessionId: string;
  uploadToken: string;
  chunkMs?: number;
  onState?: (s: RecorderState) => void;
};

const W = 1280;
const H = 720;

export class LiveSessionRecorder {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private recorder: MediaRecorder | null = null;
  private queue: Array<{ index: number; blob: Blob; retries: number }> = [];
  private next = 0;
  private sent = 0;
  private bytes = 0;
  private draining = false;
  private audioCtx: AudioContext | null = null;
  private mixedStream: MediaStream | null = null;
  private raf = 0;
  private timers: number[] = [];

  constructor(
    private args: Args,
    private sources: () => Array<{ video: HTMLVideoElement | null; label: string; muted?: boolean }>,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
  }

  get isRecording() {
    return this.recorder?.state === "recording";
  }

  start(audioStreams: MediaStream[]): void {
    // 1) audio: mic (host) + every remote participant we can hear
    this.audioCtx = new AudioContext();
    const dest = this.audioCtx.createMediaStreamDestination();
    for (const stream of audioStreams) {
      const tracks = stream.getAudioTracks();
      if (!tracks.length) continue;
      const src = this.audioCtx.createMediaStreamSource(new MediaStream(tracks));
      src.connect(dest);
    }

    // 2) video: our composite canvas
    this.paint();
    const canvasStream = this.canvas.captureStream(25);
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()];
    this.mixedStream = new MediaStream(tracks);

    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(
      (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    );
    this.recorder = new MediaRecorder(this.mixedStream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 2_000_000,
      audioBitsPerSecond: 96_000,
    });
    this.recorder.ondataavailable = (e) => {
      if (!e.data?.size) return;
      this.queue.push({ index: this.next++, blob: e.data, retries: 0 });
      this.emit();
      void this.drain();
    };
    this.recorder.start(this.args.chunkMs ?? 4000);

    // safety net: a stalled queue must always retry by itself
    this.timers.push(window.setInterval(() => void this.drain(), 5000) as unknown as number);
  }

  async stop(): Promise<boolean> {
    const rec = this.recorder;
    if (!rec) return true;
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      if (rec.state !== "inactive") rec.stop();
      else resolve();
    });
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearInterval(t);
    this.timers = [];

    const deadline = Date.now() + 90_000;
    while (this.queue.length && Date.now() < deadline) {
      await this.drain();
      if (this.queue.length) await new Promise((r) => setTimeout(r, 800));
    }

    this.mixedStream?.getTracks().forEach((t) => t.stop());
    await this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    return this.queue.length === 0;
  }

  private emit() {
    this.args.onState?.({ sent: this.sent, queued: this.queue.length, failed: this.queue[0]?.retries ?? 0, bytes: this.bytes });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const item = this.queue[0];
        try {
          const res = await fetch(`${this.args.serviceUrl}/sessions/${this.args.sessionId}/chunks/${item.index}`, {
            method: "PUT",
            headers: { "content-type": "application/octet-stream", authorization: `Bearer ${this.args.uploadToken}` },
            body: item.blob,
          });
          if (!res.ok) throw new Error(String(res.status));
          this.queue.shift();
          this.sent += 1;
          this.bytes += item.blob.size;
          this.emit();
        } catch {
          item.retries += 1;
          this.emit();
          // never drop a chunk: a short network drop must heal on its own
          await new Promise((r) => setTimeout(r, item.retries >= 3 ? 5000 : Math.min(8000, 600 * item.retries)));
          if (item.retries >= 8) item.retries = 0;
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /** Composite frame: the host in the centre, participants around. */
  private paint = () => {
    const ctx = this.ctx;
    ctx.fillStyle = "#0b1f19";
    ctx.fillRect(0, 0, W, H);

    const tiles = this.sources().filter((s) => s.video && s.video.readyState >= 2);
    if (!tiles.length) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "bold 34px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("حصّة مباشرة", W / 2, H / 2);
    } else if (tiles.length === 1) {
      this.tile(tiles[0].video!, 0, 0, W, H);
    } else {
      const cols = tiles.length <= 4 ? 2 : 3;
      const rows = Math.ceil(tiles.length / cols);
      const tw = W / cols;
      const th = H / rows;
      tiles.slice(0, cols * rows).forEach((t, i) => {
        const cx = (i % cols) * tw;
        const cy = Math.floor(i / cols) * th;
        this.tile(t.video!, cx + 4, cy + 4, tw - 8, th - 8);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(cx + 10, cy + th - 44, Math.min(tw - 20, 240), 30);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(t.label.slice(0, 22), cx + tw - 20, cy + th - 22);
      });
    }
    this.raf = requestAnimationFrame(this.paint);
  };

  private tile(video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
    this.ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    this.ctx.restore();
  }
}
