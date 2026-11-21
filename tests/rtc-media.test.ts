import { describe, expect, it } from "vitest";
import { hasLiveVideo, pickVideoStream } from "@/lib/rtc-media";

/** Minimal MediaStream stand-in for the pure selection logic. */
const stream = (kind: "video" | "audio", { muted = false, state = "live" }: { muted?: boolean; state?: MediaStreamTrackState } = {}) =>
  ({
    getVideoTracks: () => (kind === "video" ? [{ kind, muted, readyState: state }] : []),
    getAudioTracks: () => (kind === "audio" ? [{ kind, muted, readyState: state }] : []),
  }) as unknown as MediaStream;

describe("choosing the stream for a tile", () => {
  it("shows the camera when the peer is not sharing a screen", () => {
    const cam = stream("video");
    const screen = stream("video"); // negotiated but empty
    expect(pickVideoStream({ cam, screen }, false)).toBe(cam);
  });

  it("shows the screen when the roster says she is sharing it", () => {
    const cam = stream("video");
    const screen = stream("video");
    expect(pickVideoStream({ cam, screen }, true)).toBe(screen);
  });

  it("shows the screen when there is no camera stream at all", () => {
    const screen = stream("video");
    expect(pickVideoStream({ screen }, true)).toBe(screen);
  });

  it("falls back to the camera stream while it is still warming up", () => {
    const cam = stream("video", { muted: true });
    expect(pickVideoStream({ cam })).toBe(cam);
    expect(hasLiveVideo(cam)).toBe(false);
  });

  it("treats an ended track as not live", () => {
    expect(hasLiveVideo(stream("video", { state: "ended" }))).toBe(false);
  });

  it("returns nothing when there are no streams", () => {
    expect(pickVideoStream(undefined)).toBeUndefined();
    expect(pickVideoStream({})).toBeUndefined();
  });
});
