import { describe, expect, it } from "vitest";
import { parseYouTubeId } from "@/lib/youtube";

describe("parseYouTubeId", () => {
  it("accepts a raw video id", () => {
    expect(parseYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("accepts watch URLs", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=abc123XYZ_-")).toBe("abc123XYZ_-");
    expect(parseYouTubeId("youtube.com/watch?si=x&v=abc12345678&list=PL")).toBe("abc12345678");
  });

  it("accepts short links, shorts, embeds and live paths", () => {
    expect(parseYouTubeId("https://youtu.be/abc123XYZ90")).toBe("abc123XYZ90");
    expect(parseYouTubeId("https://www.youtube.com/shorts/abc123XYZ90")).toBe("abc123XYZ90");
    expect(parseYouTubeId("https://www.youtube.com/embed/abc123XYZ90")).toBe("abc123XYZ90");
    expect(parseYouTubeId("https://www.youtube.com/live/abc123XYZ90")).toBe("abc123XYZ90");
  });

  it("normalizes Arabic keyboard layouts and whitespace", () => {
    expect(parseYouTubeId("  https://youtu.be/abc123XYZ90  ")).toBe("abc123XYZ90");
  });

  it("rejects invalid input", () => {
    expect(parseYouTubeId("")).toBe("");
    expect(parseYouTubeId("https://youtube.com/watch?list=PL123")).toBe("");
    expect(parseYouTubeId("https://vimeo.com/12345")).toBe("");
    expect(parseYouTubeId("verylongnonsensetextthatcannotbeavideoid")).toBe("");
  });
});
