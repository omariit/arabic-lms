import { describe, expect, it } from "vitest";
import { DEFAULT_SECTIONS, type SiteData, mergeDicts } from "@/lib/site-content";

describe("site content", () => {
  it("mergeDicts keeps defaults and applies overrides (strings + arrays)", () => {
    const base = { a: "1", list: ["x", "y"] };
    const out = mergeDicts(base as Record<string, unknown>, {
      a: "2",
      list: ["p", "q", "r"],
      extra: "3",
    });
    expect(out.a).toBe("2");
    expect(out.list).toEqual(["p", "q", "r"]);
    expect(out.extra).toBe("3");
  });

  it("empty overrides return the base untouched", () => {
    const base = { a: "1" };
    const out = mergeDicts(base as Record<string, unknown>, {});
    expect(out).toEqual(base);
  });

  it("DEFAULT_SECTIONS enables every landing section by default", () => {
    expect(Object.values(DEFAULT_SECTIONS).every(Boolean)).toBe(true);
  });

  it("SiteData shape validates", () => {
    const data: SiteData = { sections: { hero: false }, texts: { ar: { heroKicker: "ب" }, en: {} } };
    expect(data.sections.hero).toBe(false);
    expect(data.texts.ar.heroKicker).toBe("ب");
  });
});
