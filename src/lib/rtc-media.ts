/**
 * Choosing *which* remote stream to paint in a tile.
 *
 * Every peer connection negotiates three m-lines (audio · camera · screen), so
 * `ontrack` fires for all of them at connection time even when nothing is being sent.
 * A screen stream that exists but is muted must never win over a live camera — that was
 * exactly the "video never arrives" bug: the tile showed an empty screen track.
 */

export type StreamSet = { cam?: MediaStream; screen?: MediaStream; audio?: MediaStream } | undefined;

export function trackIsLive(track: MediaStreamTrack | undefined | null): boolean {
  if (!track) return false;
  return track.readyState === "live" && !track.muted;
}

/** A stream counts as video only when it carries a live video track. */
export function hasLiveVideo(stream: MediaStream | undefined | null): boolean {
  if (!stream) return false;
  const video = stream.getVideoTracks();
  if (video.length === 0) return false;
  return video.some((t) => trackIsLive(t));
}

/**
 * The screen stream wins *only when the peer is really sharing it* — the roster says so.
 * Chrome reports a negotiated-but-silent m-line as an unmuted track with zero frames, so
 * "is it muted?" is not a reliable test; the participant's own state is.
 */
export function pickVideoStream(streams: StreamSet, preferScreen = false): MediaStream | undefined {
  if (!streams) return undefined;
  if (preferScreen && streams.screen) return streams.screen;
  if (streams.cam) return streams.cam;
  if (streams.screen) return streams.screen;
  return undefined;
}

export function pickAudioStream(streams: StreamSet): MediaStream | undefined {
  return streams?.audio;
}
