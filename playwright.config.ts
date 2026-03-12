import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/qa",
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["line"],
    ["json", { outputFile: "output/qa/playwright-report.json" }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
});
