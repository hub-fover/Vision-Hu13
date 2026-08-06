import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e', timeout:30_000,
  webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4174/web/',reuseExistingServer:true},
  use:{baseURL:'http://127.0.0.1:4174/web/',trace:'retain-on-failure'},
  projects:[{name:'desktop',use:{viewport:{width:1440,height:900}}},{name:'Pixel 7',use:{...devices['Pixel 7']}}],
});
