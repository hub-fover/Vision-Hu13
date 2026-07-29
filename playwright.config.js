import { defineConfig } from "@playwright/test";

const e2ePort = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.js",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome",
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
});
