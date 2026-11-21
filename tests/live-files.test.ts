import { describe, expect, it } from "vitest";
import { liveFileKey, liveFileKeyAllowed } from "@/lib/live-files";

const SESSION = "clx0session0001";
const USER = "clx0user0001";

describe("liveFileKeyAllowed", () => {
  it("accepts a file in the uploading user's own namespace", () => {
    expect(liveFileKeyAllowed(liveFileKey(`livefile/2026-11-21/${USER}/`, "abc"), { userId: USER, liveSessionId: SESSION })).toBe(true);
  });

  it("accepts a guest file stored in the session namespace", () => {
    expect(liveFileKeyAllowed(liveFileKey(`livefile/2026-11-21/${SESSION}/`, "abc"), { liveSessionId: SESSION })).toBe(true);
    expect(liveFileKeyAllowed(liveFileKey(`livefile/2026-11-21/${SESSION}/`, "abc"), { userId: null, liveSessionId: SESSION })).toBe(true);
  });

  it("rejects another user's namespace", () => {
    expect(liveFileKeyAllowed(`livefile/2026-11-21/other-user/abc`, { userId: USER, liveSessionId: SESSION })).toBe(false);
  });

  it("rejects other session namespaces for guests", () => {
    expect(liveFileKeyAllowed(`livefile/2026-11-21/another-session/abc`, { userId: null, liveSessionId: SESSION })).toBe(false);
  });

  it("rejects keys from another feature or a mangled key", () => {
    expect(liveFileKeyAllowed(`submission/2026-11-21/${USER}/abc`, { userId: USER, liveSessionId: SESSION })).toBe(false);
    expect(liveFileKeyAllowed("livefile/2026-11-21/abc", { userId: USER, liveSessionId: SESSION })).toBe(false);
    expect(liveFileKeyAllowed("", { userId: USER, liveSessionId: SESSION })).toBe(false);
    expect(liveFileKeyAllowed(null, { userId: USER, liveSessionId: SESSION })).toBe(false);
  });
});
