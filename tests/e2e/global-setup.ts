import { request } from "@playwright/test";

/** Wake the staging container before the first test so cold starts don't look like bugs. */
export default async function globalSetup() {
  const baseURL = process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app";
  const ctx = await request.newContext({ baseURL });
  for (let i = 0; i < 20; i++) {
    try {
      const res = await ctx.get("/api/health");
      if (res.ok()) break;
    } catch {
      /* cold start */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  await ctx.dispose();
}
