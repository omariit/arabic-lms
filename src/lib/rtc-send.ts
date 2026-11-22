/**
 * How much the browser is allowed to spend sending us media.
 *
 * A Quran lesson is a face, a page of the mushaf and a voice — not cinema. Capping the
 * encoder is the cheapest optimisation there is: the bytes never leave the student's
 * device, so her mobile data (which is what actually costs a family in Jordan) and the
 * teacher's upload drop by roughly half, while a page of text stays perfectly readable.
 *
 * Deliberately pure so the numbers can be unit tested without a browser.
 */

export type SendKind = "audio" | "cam" | "screen";

export type SendProfile = {
  /** Hard ceiling for the encoder, in bits per second. */
  maxBitrate: number;
  /** What the track is used for — changes how the encoder spends its bits. */
  contentHint: "speech" | "motion" | "detail";
  /** Screen text must stay sharp; a face may drop resolution instead. */
  degradationPreference: "balanced" | "maintain-resolution" | "maintain-framerate";
  /** Capture settings we ask the device for. */
  capture: MediaTrackConstraints | boolean;
};

/**
 * Audio: 24 kbps mono Opus is transparent for a human voice (music needs more).
 * Camera: 320 kbps is a clean 360p face at 20fps.
 * Screen: 900 kbps at 10–12fps keeps Arabic text crisp; a slide does not move.
 */
export const SEND_PROFILES: Record<SendKind, SendProfile> = {
  audio: {
    maxBitrate: 24_000,
    contentHint: "speech",
    degradationPreference: "balanced",
    capture: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  },
  cam: {
    maxBitrate: 320_000,
    contentHint: "motion",
    degradationPreference: "balanced",
    capture: { width: { ideal: 640, max: 960 }, height: { ideal: 360, max: 540 }, frameRate: { ideal: 20, max: 24 } },
  },
  screen: {
    maxBitrate: 900_000,
    contentHint: "detail",
    degradationPreference: "maintain-resolution",
    capture: { frameRate: { ideal: 10, max: 15 } },
  },
};

/** Patch passed to `sender.setParameters()` — only the fields we own. */
export function sendParametersFor(kind: SendKind, current?: RTCRtpSendParameters | null) {
  const profile = SEND_PROFILES[kind];
  const first = current?.encodings?.[0];
  return {
    encodings: [{ ...(first ?? {}), maxBitrate: profile.maxBitrate }],
    degradationPreference: profile.degradationPreference,
  };
}

/** Rough megabytes moved in an hour at a given bitrate (what a student's data plan sees). */
export function megabytesPerHour(kbps: number): number {
  return Math.round(((kbps * 3600) / 8 / 1024) * 10) / 10;
}

/** Sum of the ceilings — the "worst case per hour" a participant can cost. */
export function hourlyBudget(kinds: SendKind[]): { kbps: number; megabytes: number } {
  const kbps = kinds.reduce((sum, k) => sum + SEND_PROFILES[k].maxBitrate / 1000, 0);
  return { kbps, megabytes: megabytesPerHour(kbps) };
}
