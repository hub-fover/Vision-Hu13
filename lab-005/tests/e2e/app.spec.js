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

test('camera permission denial keeps the album fallback available', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { const error = new Error('permission denied'); error.name = 'NotAllowedError'; throw error; } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '用相机拍摄' }).click();
  await expect(page.locator('#camera-status')).toContainText('相册');
  await expect(page.getByText('从相册选择五张', { exact: true })).toBeVisible();
  await expect(page.locator('#camera-preview')).toBeHidden();
});

test('camera preview can capture without hardware focus controls', async ({ page }) => {
  await page.addInitScript(() => {
    const stream = document.createElement('canvas').captureStream(); const track = stream.getVideoTracks()[0]; const nativeStop = track.stop.bind(track);
    Object.defineProperty(track, 'getCapabilities', { configurable: true, value: () => ({}) });
    Object.defineProperty(track, 'stop', { configurable: true, value: () => { window.__trackStopped = true; nativeStop(); } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => stream } });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: async function () { this.readyState = 4; } });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
    HTMLCanvasElement.prototype.toBlob = function (callback) { callback(new Blob(['camera'], { type: 'image/jpeg' })); };
    window.createImageBitmap = async () => ({ width: 640, height: 480, close() {} });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '用相机拍摄' }).click();
  await expect(page.locator('#camera-preview')).toBeVisible();
  await expect(page.locator('#focus-distance-control')).toBeHidden();
  await expect(page.locator('#camera-status')).toContainText('调焦');
  await page.getByRole('button', { name: '拍下一张' }).click();
  await expect(page.locator('.capture-slot').first()).toContainText('已选择');
});

test('supported focus distance is surfaced and every camera exit releases its stream', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      const stream = document.createElement('canvas').captureStream(); const track = stream.getVideoTracks()[0]; const nativeStop = track.stop.bind(track);
      Object.defineProperty(track, 'getCapabilities', { configurable: true, value: () => ({ focusDistance: { min: 0.1, max: 4, step: 0.1 } }) });
      Object.defineProperty(track, 'applyConstraints', { configurable: true, value: async constraints => { window.__focusConstraint = constraints; } });
      Object.defineProperty(track, 'stop', { configurable: true, value: () => { window.__stoppedTracks = (window.__stoppedTracks || 0) + 1; nativeStop(); } });
      return stream;
    } } });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: async function () { this.readyState = 4; } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '用相机拍摄' }).click();
  await expect(page.locator('#focus-distance-control')).toBeVisible();
  await expect(page.locator('#focus-distance')).toHaveAttribute('min', '0.1');
  await expect(page.locator('#focus-distance')).toHaveAttribute('max', '4');
  await page.locator('#focus-distance').fill('2');
  await expect.poll(() => page.evaluate(() => window.__focusConstraint?.advanced?.[0]?.focusDistance)).toBe(2);
  await page.getByRole('button', { name: '关闭相机' }).click();
  await expect.poll(() => page.evaluate(() => window.__stoppedTracks)).toBe(1);
  await page.getByRole('button', { name: '用相机拍摄' }).click();
  await page.getByRole('button', { name: '清空' }).click();
  await expect.poll(() => page.evaluate(() => window.__stoppedTracks)).toBe(2);
  await page.getByRole('button', { name: '用相机拍摄' }).click();
  await page.getByRole('tab', { name: '镜头标定' }).click();
  await expect(page.locator('#camera-preview')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__stoppedTracks)).toBe(3);
});
