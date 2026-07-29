import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.LAB002_E2E_PORT || 4273);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.js",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome",
    acceptDownloads: true,
  },
  projects: [
    {
      name: "pixel-7",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 1000 } },
    },
  ],
});
