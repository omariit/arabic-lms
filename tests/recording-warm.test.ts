import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The recording service runs with Railway "app sleeping": the first request after
 * an idle period can fail with 502/503 or a network error while the container
 * boots. These tests pin the recovery behaviour without needing a real cold start.
 */
async function loadModule(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("@/lib/recording");
}

const ENV = {
  RECORDING_SERVICE_URL: "https://recording.example",
  RECORDING_SHARED_SECRET: "s".repeat(32),
};

describe("recording service cold start", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("warmRecordingService waits through 502s until the service answers", async () => {
    const { warmRecordingService } = await loadModule(ENV);
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls < 3) return new Response("bad gateway", { status: 502 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    const result = await warmRecordingService(5000);
    expect(result.awake).toBe(true);
    expect(calls).toBe(3);
  });

  it("warmRecordingService gives up with an Arabic message and a clear promise", async () => {
    const { warmRecordingService } = await loadModule(ENV);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));

    await expect(warmRecordingService(600)).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("لم تستيقظ"),
    });
  });

  it("finalize retries an edge 5xx caused by the wake-up", async () => {
    const { finalizeRemote } = await loadModule(ENV);
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) return new Response("bad gateway", { status: 503 });
        return new Response(JSON.stringify({ state: { sessionId: "s1", status: "PROCESSING" } }), { status: 200 });
      }),
    );

    const result = await finalizeRemote("s1");
    expect(result.state.status).toBe("PROCESSING");
    expect(calls).toBe(2);
  });

  it("does not hide a real application error behind the retry", async () => {
    const { finalizeRemote } = await loadModule(ENV);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "لا توجد مقاطع مرفوعة" }), { status: 400 })),
    );

    await expect(finalizeRemote("s1")).rejects.toMatchObject({ status: 400, message: "لا توجد مقاطع مرفوعة" });
  });

  it("reports a sleeping service as a retryable 503, not a generic failure", async () => {
    const { fetchRemoteState } = await loadModule(ENV);
    // Every attempt answers 502 (edge still booting) — the message must say the
    // service is waking up, and the status must stay retryable.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 502 })));

    const error = (await fetchRemoteState("s1").catch((e) => e)) as { status: number; message: string };
    expect(error.status).toBe(503);
    expect(error.message).toContain("تستيقظ");
  });
});
