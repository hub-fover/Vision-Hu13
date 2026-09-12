import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4177',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/vendor-runtime.mjs && node scripts/serve.mjs',
    cwd: import.meta.dirname,
    url: 'http://127.0.0.1:4177/config.js',
    reuseExistingServer: true,
    timeout: 20_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-13-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
