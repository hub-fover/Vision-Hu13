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
  expect(result.error).toBeUndefined();
  expect(result.result).toMatchObject({ Mat: true, findChessboardCorners: false, calibrateCamera: false, calibrateCameraExtended: true, checkerboardFallback: true, undistort: true });
});

test('browser fallback detects a synthetic chessboard and calibrates real intrinsics', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one calibration fixture is sufficient');
  test.setTimeout(120_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const frames = [];
    for (let view = 0; view < 4; view++) {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.save(); context.translate(20 + view * 10, 20 + view * 3); context.transform(1, view * 0.03, view * 0.02, 1, 0, 0);
      for (let row = 0; row < 7; row++) for (let col = 0; col < 10; col++) { context.fillStyle = (row + col) % 2 ? '#fff' : '#000'; context.fillRect(col * 22, row * 22, 22, 22); }
      context.restore(); frames.push({ bitmap: await createImageBitmap(canvas), width: 320, height: 240 });
    }
    const worker = new Worker('./js/defocus.bootstrap.js');
    return await new Promise(resolve => {
      const timeout = setTimeout(() => resolve({ error: { code: 'TIMEOUT' } }), 60_000);
      worker.onmessage = event => { if (!event.data.error && !event.data.result) return; clearTimeout(timeout); worker.terminate(); resolve(event.data); };
      worker.onerror = event => { clearTimeout(timeout); worker.terminate(); resolve({ error: { code: 'WORKER_ERROR', message: event.message } }); };
      worker.postMessage({ id: 1, type: 'calibrateIntrinsics', payload: { frames, pattern: { cols: 9, rows: 6, squareSize: 0.025 } } }, frames.map(frame => frame.bitmap));
    });
  });
  expect(result.error).toBeUndefined();
  expect(result.result.viewsAccepted).toBeGreaterThanOrEqual(3);
  expect(result.result.intrinsics.matrix[0][0]).toBeGreaterThan(0);
  expect(result.result.rmsErrorPx).toBeLessThan(2);
});
