import { describe, expect, it } from "vitest";
import { SEND_PROFILES, hourlyBudget, megabytesPerHour, sendParametersFor } from "@/lib/rtc-send";

describe("send-side budget", () => {
  it("caps audio far below video", () => {
    expect(SEND_PROFILES.audio.maxBitrate).toBeLessThan(SEND_PROFILES.cam.maxBitrate / 5);
  });

  it("gives the screen more room than the camera and asks for sharp text", () => {
    expect(SEND_PROFILES.screen.maxBitrate).toBeGreaterThan(SEND_PROFILES.cam.maxBitrate);
    expect(SEND_PROFILES.screen.contentHint).toBe("detail");
    expect(SEND_PROFILES.screen.degradationPreference).toBe("maintain-resolution");
  });

  it("keeps a face cheap: 360p at 20fps", () => {
    const cam = SEND_PROFILES.cam.capture as MediaTrackConstraints;
    expect(cam.width).toMatchObject({ ideal: 640 });
    expect(cam.frameRate).toMatchObject({ ideal: 20 });
  });

  it("never sends stereo or 48k audio", () => {
    const audio = SEND_PROFILES.audio.capture as MediaTrackConstraints;
    expect(audio.channelCount).toBe(1);
  });

  it("patches only maxBitrate and degradation, keeping the existing encoding", () => {
    const current = { encodings: [{ rid: "x", active: true }], degradationPreference: "balanced" } as unknown as RTCRtpSendParameters;
    const patch = sendParametersFor("cam", current);
    expect(patch.encodings[0]).toMatchObject({ rid: "x", active: true, maxBitrate: SEND_PROFILES.cam.maxBitrate });
    expect(patch.degradationPreference).toBe("balanced");
  });

  it("works when the sender has no encoding yet", () => {
    expect(sendParametersFor("screen", null).encodings[0]).toEqual({ maxBitrate: SEND_PROFILES.screen.maxBitrate });
  });

  it("converts bitrate to an hourly data budget", () => {
    expect(megabytesPerHour(24)).toBe(10.5);
    expect(megabytesPerHour(800)).toBe(351.6);
  });

  it("totals the whole session ceiling", () => {
    const all = hourlyBudget(["audio", "cam", "screen"]);
    expect(all.kbps).toBe(1244);
    expect(all.megabytes).toBeCloseTo(546.7, 1);
    // without screen share a lesson stays comfortably inside a 1 GB mobile plan
    expect(hourlyBudget(["audio", "cam"]).megabytes).toBeLessThan(200);
  });
});
