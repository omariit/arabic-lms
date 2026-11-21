import { describe, expect, it } from "vitest";
import { EMPTY_SUMMARY, qualityOf, summarise, type RawStat } from "@/lib/rtc-stats";

const t0 = 1_700_000_000_000;

const report = (bytesIn: number, bytesOut: number, frames: number): RawStat[] => [
  { type: "inbound-rtp", kind: "video", bytesReceived: bytesIn, packetsReceived: 1000, packetsLost: 0, frameWidth: 1280, frameHeight: 720, framesDecoded: frames },
  { type: "inbound-rtp", kind: "audio", bytesReceived: 4000, packetsReceived: 500, packetsLost: 0 },
  { type: "outbound-rtp", kind: "video", bytesSent: bytesOut },
  { type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.042 },
  { type: "local-candidate", candidateType: "srflx" },
  { type: "codec", mimeType: "video/VP8" },
];

describe("webrtc quality summary", () => {
  it("turns byte counters into kbps between samples", () => {
    const first = summarise(report(100_000, 50_000, 0), null, t0);
    expect(first.summary.inKbps).toBe(0); // nothing to compare against yet
    expect(first.summary.receiving).toBe(true);

    const second = summarise(report(100_000 + 125_000, 50_000 + 250_000, 60), first.next, t0 + 2000);
    // 125 kB over 2 s = 500 kbps in, 250 kB over 2 s = 1000 kbps out
    expect(second.summary.inKbps).toBe(500);
    expect(second.summary.outKbps).toBe(1000);
    expect(second.summary.width).toBe(1280);
    expect(second.summary.height).toBe(720);
    expect(second.summary.rttMs).toBe(42);
    expect(second.summary.candidate).toBe("srflx");
    expect(second.summary.codec).toBe("VP8");
    expect(second.summary.framesDecoded).toBe(60);
  });

  it("estimates fps when the browser does not report it", () => {
    const a = summarise(report(1000, 1000, 0), null, t0);
    const b = summarise(report(2000, 2000, 50), a.next, t0 + 5000);
    expect(b.summary.fps).toBe(10); // 50 frames over 5 s
  });

  it("reports packet loss as a percentage", () => {
    const stats: RawStat[] = [
      { type: "inbound-rtp", kind: "video", bytesReceived: 10, packetsReceived: 90, packetsLost: 10 },
    ];
    expect(summarise(stats, null, t0).summary.lossPct).toBe(10);
  });

  it("never returns a negative bitrate when counters reset", () => {
    const a = summarise(report(500_000, 500_000, 0), null, t0);
    const b = summarise(report(10_000, 10_000, 0), a.next, t0 + 2000);
    expect(b.summary.inKbps).toBe(0);
    expect(b.summary.outKbps).toBe(0);
  });

  it("has no numbers before anything arrives", () => {
    const empty = summarise([], null, t0).summary;
    expect(empty).toEqual(EMPTY_SUMMARY);
    expect(qualityOf(empty)).toBe("idle");
  });

  it("colours the verdict by latency and loss", () => {
    expect(qualityOf({ ...EMPTY_SUMMARY, receiving: true, rttMs: 40, lossPct: 0 })).toBe("good");
    expect(qualityOf({ ...EMPTY_SUMMARY, receiving: true, rttMs: 250, lossPct: 1 })).toBe("fair");
    expect(qualityOf({ ...EMPTY_SUMMARY, receiving: true, rttMs: 500, lossPct: 1 })).toBe("poor");
    expect(qualityOf({ ...EMPTY_SUMMARY, receiving: true, rttMs: 60, lossPct: 9 })).toBe("poor");
  });
});
