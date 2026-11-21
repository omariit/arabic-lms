/**
 * WebRTC quality from `RTCPeerConnection.getStats()`.
 *
 * Kept pure so the numbers shown to the teacher can be unit tested without a browser:
 * `summarise()` takes the flat list of stat objects Chrome/WebKit report and returns
 * the handful of numbers a human can read (kbps both ways, latency, loss, resolution).
 */

export type RawStat = Record<string, unknown> & { type?: string };

export type PeerSummary = {
  /** kilobits per second received / sent since the previous sample */
  inKbps: number;
  outKbps: number;
  /** round-trip time in milliseconds */
  rttMs: number | null;
  /** percentage of lost packets on the inbound video/audio */
  lossPct: number | null;
  width: number | null;
  height: number | null;
  /** frames per second decoded (video) */
  fps: number | null;
  /** 'relay' | 'srflx' | 'host' | 'prflx' | null — relay means TURN is doing the work */
  candidate: string | null;
  codec: string | null;
  /** any inbound video/audio exists */
  receiving: boolean;
  /** inbound video frames actually decoded since the previous sample */
  framesDecoded: number;
};

export type Sample = { bytes: number; time: number; frames?: number };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const EMPTY_SUMMARY: PeerSummary = {
  inKbps: 0,
  outKbps: 0,
  rttMs: null,
  lossPct: null,
  width: null,
  height: null,
  fps: null,
  candidate: null,
  codec: null,
  receiving: false,
  framesDecoded: 0,
};

/**
 * @param stats   the values of `RTCStatsReport` (an array of stat objects)
 * @param prev    the previous sample for this peer (to turn byte counters into kbps)
 * @param now     timestamp of this sample in ms
 */
export function summarise(
  stats: RawStat[],
  prev?: { inBytes?: Sample; outBytes?: Sample; frames?: Sample } | null,
  now: number = Date.now(),
): { summary: PeerSummary; next: { inBytes: Sample; outBytes: Sample; frames: Sample } } {
  const summary: PeerSummary = { ...EMPTY_SUMMARY };

  let inBytes = 0;
  let outBytes = 0;
  let framesDecoded = 0;
  let lost = 0;
  let received = 0;
  let videoIn = false;

  for (const s of stats) {
    const type = s.type;
    if (type === "inbound-rtp") {
      const bytes = num(s.bytesReceived) ?? 0;
      inBytes += bytes;
      received += num(s.packetsReceived) ?? 0;
      lost += num(s.packetsLost) ?? 0;
      if (s.kind === "video" || s.mediaType === "video") {
        videoIn = true;
        const w = num(s.frameWidth);
        const h = num(s.frameHeight);
        if (w && h) {
          summary.width = w;
          summary.height = h;
        }
        framesDecoded += num(s.framesDecoded) ?? 0;
        const fps = num(s.framesPerSecond);
        if (fps !== null) summary.fps = Math.round(fps);
        if (typeof s.codecId === "string") summary.codec = s.codecId;
      }
    } else if (type === "outbound-rtp") {
      outBytes += num(s.bytesSent) ?? 0;
    } else if (type === "candidate-pair" && (s.state === "succeeded" || s.nominated === true)) {
      const rtt = num(s.currentRoundTripTime);
      if (rtt !== null) summary.rttMs = Math.round(rtt * 1000);
    } else if (type === "remote-inbound-rtp") {
      const rtt = num(s.roundTripTime);
      if (rtt !== null && summary.rttMs === null) summary.rttMs = Math.round(rtt * 1000);
    } else if (type === "local-candidate" && typeof s.candidateType === "string") {
      // the last one wins; a relay candidate means traffic goes through TURN
      summary.candidate = s.candidateType;
    } else if (type === "codec" && typeof s.mimeType === "string") {
      const m = /video\/(\w+)/i.exec(s.mimeType);
      if (m) summary.codec = m[1].toUpperCase();
    }
  }

  summary.receiving = inBytes > 0;
  summary.framesDecoded = framesDecoded;
  summary.lossPct = received > 0 ? Math.round((lost / (lost + received)) * 1000) / 10 : null;

  const kbps = (cur: number, before: Sample | undefined) => {
    if (!before || now <= before.time) return 0;
    const delta = cur - before.bytes;
    if (delta <= 0) return 0;
    return Math.round((delta * 8) / ((now - before.time) / 1000) / 1000);
  };

  summary.inKbps = kbps(inBytes, prev?.inBytes);
  summary.outKbps = kbps(outBytes, prev?.outBytes);

  const prevFrames = prev?.frames;
  if (prevFrames && now > prevFrames.time) {
    const dFrames = framesDecoded - (prevFrames.frames ?? 0);
    const secs = (now - prevFrames.time) / 1000;
    if (dFrames >= 0 && secs > 0 && summary.fps === null) summary.fps = Math.round(dFrames / secs);
  }

  return {
    summary,
    next: {
      inBytes: { bytes: inBytes, time: now },
      outBytes: { bytes: outBytes, time: now },
      frames: { bytes: 0, time: now, frames: framesDecoded },
    },
  };
}

/** A one-word verdict the UI can colour (green / amber / red). */
export function qualityOf(s: PeerSummary | undefined): "good" | "fair" | "poor" | "idle" {
  if (!s) return "idle";
  if (!s.receiving && s.inKbps === 0) return "idle";
  const rtt = s.rttMs ?? 0;
  const loss = s.lossPct ?? 0;
  if (rtt > 400 || loss > 8) return "poor";
  if (rtt > 200 || loss > 3) return "fair";
  return "good";
}

export const QUALITY_LABEL: Record<ReturnType<typeof qualityOf>, string> = {
  good: "ممتاز",
  fair: "متوسط",
  poor: "ضعيف",
  idle: "بلا بيانات",
};
