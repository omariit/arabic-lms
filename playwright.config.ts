import { defineConfig, devices } from "@playwright/test";

/**
 * UI QA suite. Targets the STAGING deployment by default — never production.
 *   QA_BASE_URL=https://arabic-lms-staging.up.railway.app npx playwright test
 */
const baseURL = process.env.QA_BASE_URL || "https://arabic-lms-staging.up.railway.app";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "qa-report", open: "never" }],
    ["json", { outputFile: "qa-report/results.json" }],
  ],
  use: {
    baseURL,
    locale: "ar-JO",
    timezoneId: "Asia/Amman",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    permissions: ["microphone", "camera"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
});
