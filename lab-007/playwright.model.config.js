import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/real-model.spec.js',
  timeout: 360_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4177', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/vendor-runtime.mjs && node scripts/serve.mjs',
    cwd: import.meta.dirname,
    url: 'http://127.0.0.1:4177/config.js',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium-wasm-model', use: { ...devices['Desktop Chrome'] } }],
});
