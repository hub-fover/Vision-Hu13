import { test, expect } from '@playwright/test';

test('sample prepares five frames and exposes result workflow', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /手机拍五张照片/ })).toBeVisible();
  await page.getByRole('button', { name: '用样例体验' }).click();
  await expect(page.locator('#analysis-status')).toContainText('五张照片已准备好');
  await expect(page.locator('#run-button')).toBeEnabled();
  await page.locator('#run-button').click();
  await expect(page.locator('#result-panel'), errors.join(' | ')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#focus-curve polyline')).toHaveAttribute('points', /,/);
});

test('calibration modes switch without horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: '镜头标定' }).click();
  await expect(page.getByRole('heading', { name: '镜头标定' })).toBeVisible();
  await page.getByRole('tab', { name: '尺度标定' }).click();
  await expect(page.getByRole('heading', { name: '尺度标定' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('runtime prerequisite probe reports calibration support honestly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one runtime smoke is sufficient');
  test.setTimeout(120_000);
  await page.goto('/');
  const result = await page.evaluate(() => new Promise((resolve, reject) => { const worker = new Worker('./js/runtime-smoke.worker.js'); const timeout = setTimeout(() => reject(new Error('runtime smoke timeout')), 12_000); worker.onerror = event => { clearTimeout(timeout); reject(new Error(`worker error: ${event.message}`)); }; worker.onmessage = event => { if (event.data.id !== 77) return; clearTimeout(timeout); worker.terminate(); resolve(event.data); }; worker.postMessage({ id: 77 }); }));
  if (result.error) expect(result.error.code).toBe('RUNTIME_MISSING');
  else expect(result.result).toEqual({ Mat: true, findChessboardCorners: true, calibrateCamera: true, undistort: true });
});
