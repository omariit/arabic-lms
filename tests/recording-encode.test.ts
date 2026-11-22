import { describe, expect, it } from "vitest";
// The service ships plain ESM; the profile decision is pure, so it can be unit tested here.
import { alreadyH264 } from "../recording-service/pipeline.js";

const ftyp = (brand: string, extra = "") => {
  const head = Buffer.alloc(64);
  head.writeUInt32BE(24, 0);
  head.write("ftyp", 4, "latin1");
  head.write(brand, 8, "latin1");
  if (extra) head.write(extra, 16, "latin1");
  return head;
};

describe("deciding whether a recording needs re-encoding", () => {
  it("accepts an H.264 MP4 stream (copy is enough)", () => {
    expect(alreadyH264(ftyp("isom", "avc1"))).toBe(true);
    expect(alreadyH264(ftyp("iso5", "avc3"))).toBe(true);
  });

  it("rejects an MP4 that carries another codec", () => {
    expect(alreadyH264(ftyp("isom", "hvc1"))).toBe(false);
    expect(alreadyH264(ftyp("M4V ", "mp4v"))).toBe(false);
  });

  it("rejects a WebM stream, which always needs transcoding", () => {
    const webm = Buffer.alloc(16);
    webm.writeUInt32BE(0x1a45dfa3, 0);
    expect(alreadyH264(webm)).toBe(false);
  });

  it("rejects a missing or truncated first chunk", () => {
    expect(alreadyH264(null)).toBe(false);
    expect(alreadyH264(Buffer.from("ftyp"))).toBe(false);
  });
});
