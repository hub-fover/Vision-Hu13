import { test, expect } from '@playwright/test';

const SAMPLE_DIR = new URL('../../web/assets/samples/', import.meta.url);
const SAMPLE_FILES = ['focus-near.svg', 'focus-near-mid.svg', 'focus-mid.svg', 'focus-far-mid.svg', 'focus-far.svg']
  .map(name => decodeURIComponent(new URL(name, SAMPLE_DIR).pathname).replace(/^\/(?:([A-Za-z]:))/, '$1'));

function namedSvgFiles(count, prefix = 'frame') {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix}-${String(index + 1).padStart(2, '0')}.svg`,
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="rgb(${index * 7 % 255},40,70)"/></svg>`)
  }));
}

async function installWorkflowWorker(page, { holdEstimate = false, estimateError = null, detachEstimateTransfers = false } = {}) {
  await page.addInitScript(({ holdEstimate, estimateError, detachEstimateTransfers }) => {
    window.__workerMessages = [];
    window.createImageBitmap = async source => {
      if (source?.closed) throw new DOMException('The source image is detached', 'InvalidStateError');
      return { width: source.width || 64, height: source.height || 48, sourceName: source.sourceName || source.name || 'canvas', closed: false, close() { this.closed = true; } };
    };
    class WorkflowWorker extends EventTarget {
      postMessage(message) {
        const summarizeFrame = frame => ({ name: frame.bitmap?.sourceName || '', width: frame.width, height: frame.height, detached: Boolean(frame.bitmap?.closed) });
        window.__workerMessages.push({
          type: message.type,
          frames: message.payload?.frames?.map(summarizeFrame) || null,
          groups: message.payload?.groups?.map(group => ({ distanceM: group.distanceM, frames: group.frames.map(summarizeFrame) })) || null
        });
        if (message.type === 'estimate' && detachEstimateTransfers) message.payload.frames.forEach(frame => frame.bitmap.close?.());
        if (message.type === 'cancel' || (message.type === 'estimate' && holdEstimate)) return;
        queueMicrotask(() => {
          if (message.type === 'estimate' && estimateError) {
            this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, error: { code: estimateError, message: estimateError } } }));
            return;
          }
          if (message.type === 'estimate') {
            const result = {
              width: 16, height: 16, tileSize: 8, cols: 2, rows: 2,
              depth: new Float32Array([0, 0.25, 0.75, 1]),
              confidence: new Float32Array([0.9, 0.8, 0.7, 0.6]),
              invalid: new Uint8Array([0, 0, 0, 1]),
              globalMetrics: new Float32Array([1, 2, 5, 3, 1]),
              curves: [
                new Float32Array([1, 2, 3, 4]), new Float32Array([2, 3, 4, 5]),
                new Float32Array([5, 4, 3, 2]), new Float32Array([3, 2, 1, 1]),
                new Float32Array([1, 1, 1, 1])
              ], quality: 0.75, metricDepthM: null, metricQuality: null,
              intrinsicsApplied: false, alignment: { applied: true, maxErrorPx: 0.5 },
              depthBitmap: new Blob(['depth'], { type: 'image/png' }),
              confidenceBitmap: new Blob(['confidence'], { type: 'image/png' })
            };
            this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, progress: 0.5 } }));
            this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, result } }));
          } else if (message.type === 'analyzeStack') {
            this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, result: { globalMetrics: new Float32Array([1, 2, 5, 3, 1]), spread: 0.8 } } }));
          } else if (message.type === 'calibrateScale') {
            this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, result: { schema: 'lab005.focus-depth-scale.v1', focusMetrics: [0.2, 0.5, 0.8], focusIndices: [0.2, 0.5, 0.8], distancesM: message.payload.distances, residualM: 0.01, intrinsicsSchema: 'lab005.camera-intrinsics.v1', imageSize: [100, 80], lensId: '未记录', orientation: 1, zoom: null } } }));
          }
        });
      }
      terminate() { window.__terminatedWorkers = (window.__terminatedWorkers || 0) + 1; }
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: WorkflowWorker });
  }, { holdEstimate, estimateError, detachEstimateTransfers });
}

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

test('album import keeps all five files and reorder controls change worker order', async ({ page }) => {
  await installWorkflowWorker(page);
  await page.goto('/');
  await page.locator('#gallery-input').setInputFiles(SAMPLE_FILES);
  await expect(page.locator('.capture-slot img')).toHaveCount(5);
  await expect(page.locator('.capture-slot').first()).toContainText('已选择');
  await page.locator('.capture-slot').first().locator('.move-right').click();
  await page.locator('#run-button').click();
  await expect(page.locator('#result-panel')).toBeVisible();
  const order = await page.evaluate(() => window.__workerMessages.find(message => message.type === 'estimate').frames.map(frame => frame.name));
  expect(order).toEqual(['focus-near-mid.svg', 'focus-near.svg', 'focus-mid.svg', 'focus-far-mid.svg', 'focus-far.svg']);
});

test('dragging a focus frame to another slot changes analysis order', async ({ page }) => {
  await installWorkflowWorker(page);
  await page.goto('/');
  await page.locator('#gallery-input').setInputFiles(SAMPLE_FILES);
  await page.locator('.capture-slot').nth(4).dragTo(page.locator('.capture-slot').first());
  await page.locator('#run-button').click();
  await expect(page.locator('#result-panel')).toBeVisible();
  const order = await page.evaluate(() => window.__workerMessages.find(message => message.type === 'estimate').frames.map(frame => frame.name));
  expect(order).toEqual(['focus-far.svg', 'focus-near.svg', 'focus-near-mid.svg', 'focus-mid.svg', 'focus-far-mid.svg']);
});

test('focus spread failure is shown with a stable error and does not expose stale results', async ({ page }) => {
  await installWorkflowWorker(page, { estimateError: 'FOCUS_SPREAD_TOO_SMALL' });
  await page.goto('/');
  await page.locator('#gallery-input').setInputFiles(SAMPLE_FILES);
  await page.locator('#run-button').click();
  await expect(page.locator('#error-message')).toContainText('焦点跨度太小');
  await expect(page.locator('#result-panel')).toBeHidden();
  await expect(page.locator('#progress-panel')).toBeHidden();
});

test('cancelling an estimate leaves five usable frames and can restart immediately', async ({ page }) => {
  await installWorkflowWorker(page, { holdEstimate: true });
  await page.goto('/');
  await page.locator('#gallery-input').setInputFiles(SAMPLE_FILES);
  await page.locator('#run-button').click();
  await expect(page.locator('#progress-panel')).toBeVisible();
  await page.locator('#cancel-button').click();
  await expect(page.locator('#error-message')).toContainText('处理已取消');
  await expect(page.locator('#run-button')).toBeEnabled();
  await page.locator('#run-button').click();
  await expect(page.locator('#progress-panel')).toBeVisible();
  expect(await page.evaluate(() => window.__workerMessages.filter(message => message.type === 'estimate').length)).toBe(2);
});

test('retry after a cancelled transfer re-decodes files instead of reusing detached bitmaps', async ({ page }) => {
  await installWorkflowWorker(page, { holdEstimate: true, detachEstimateTransfers: true });
  await page.goto('/');
  await page.locator('#gallery-input').setInputFiles(SAMPLE_FILES);
  await page.locator('#run-button').click();
  await page.locator('#cancel-button').click();
  await page.locator('#run-button').click();
  const detached = await page.evaluate(() => window.__workerMessages.filter(message => message.type === 'estimate').at(-1).frames.map(frame => frame.detached));
  expect(detached).toEqual([false, false, false, false, false]);
});

test('result supports depth query, PNG and JSON downloads, and share fallback', async ({ page }) => {
  await installWorkflowWorker(page);
  await page.goto('/');
  await page.locator('#gallery-input').setInputFiles(SAMPLE_FILES);
  await page.locator('#run-button').click();
  await expect(page.locator('#result-panel')).toBeVisible();

  await page.locator('#result-preview').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('#sample-query')).toBeVisible();
  await expect(page.locator('#query-value')).toContainText('0%');
  await expect(page.locator('#query-value')).toContainText('90%');
  await expect(page.locator('.focus-chart figcaption')).toContainText('查询位置');
  await expect(page.locator('#focus-curve polyline')).toHaveAttribute('points', '20,88 110,71 200,20 290,54 380,88');

  const png = page.waitForEvent('download');
  await page.locator('#download-button').click();
  expect((await png).suggestedFilename()).toBe('lab-005-relative-depth.png');
  const json = page.waitForEvent('download');
  await page.locator('#download-json').click();
  expect((await json).suggestedFilename()).toBe('lab-005-depth.json');

  await page.locator('#share-button').click();
  await expect(page.locator('#share-status')).toContainText('下载按钮');
});

test('five imported frames show a Worker-computed focus spread before estimation', async ({ page }) => {
  await installWorkflowWorker(page);
  await page.goto('/');
  await page.locator('#gallery-input').setInputFiles(SAMPLE_FILES);
  await expect(page.locator('#analysis-status')).toContainText('焦点跨度 80%');
  expect(await page.evaluate(() => window.__workerMessages.filter(message => message.type === 'analyzeStack').length)).toBe(1);
});

test('system share includes the generated depth PNG when file sharing is available', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => data.files?.length === 1 });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__sharedDepth = { fileName: data.files?.[0]?.name, fileType: data.files?.[0]?.type, title: data.title }; } });
  });
  await installWorkflowWorker(page);
  await page.goto('/');
  await page.locator('#gallery-input').setInputFiles(SAMPLE_FILES);
  await page.locator('#run-button').click();
  await page.locator('#share-button').click();
  await expect.poll(() => page.evaluate(() => window.__sharedDepth)).toMatchObject({ fileName: 'lab-005-relative-depth.png', fileType: 'image/png', title: 'LAB 005 离焦测深' });
  await expect(page.locator('#share-status')).toContainText('深度图');
});

test('leaving the page terminates the Worker and releases input and result URLs', async ({ page }) => {
  await page.addInitScript(() => {
    window.__revokedUrls = [];
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = value => { window.__revokedUrls.push(value); originalRevoke(value); };
  });
  await installWorkflowWorker(page);
  await page.goto('/');
  await page.locator('#gallery-input').setInputFiles(SAMPLE_FILES);
  await page.locator('#run-button').click();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  const released = await page.evaluate(() => ({ terminated: window.__terminatedWorkers, revoked: window.__revokedUrls.length }));
  expect(released.terminated).toBe(1);
  expect(released.revoked).toBeGreaterThanOrEqual(7);
});

test('scale calibration rejects any count other than fifteen without starting Worker', async ({ page }) => {
  await installWorkflowWorker(page);
  await page.goto('/');
  await page.locator('button[data-mode="scale"]').click();
  await page.locator('#scale-input').setInputFiles(namedSvgFiles(14, 'scale'));
  await page.locator('#scale-button').click();
  await expect(page.locator('#scale-status')).toContainText('15');
  expect(await page.evaluate(() => window.__workerMessages.filter(message => message.type === 'calibrateScale').length)).toBe(0);
});

test('scale calibration requires intrinsics before fitting absolute depth', async ({ page }) => {
  await installWorkflowWorker(page);
  await page.goto('/');
  await page.locator('button[data-mode="scale"]').click();
  await page.locator('#scale-input').setInputFiles(namedSvgFiles(15, 'scale'));
  await page.locator('#scale-button').click();
  await expect(page.locator('#scale-status')).toContainText('镜头内参');
  expect(await page.evaluate(() => window.__workerMessages.filter(message => message.type === 'calibrateScale').length)).toBe(0);
});

test('scale calibration groups fifteen files into ordered sets of five', async ({ page }) => {
  await installWorkflowWorker(page);
  await page.goto('/');
  await page.locator('#intrinsics-import').setInputFiles({
    name: 'camera.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema: 'lab005.camera-intrinsics.v1', intrinsics: { matrix: [[100, 0, 32], [0, 100, 24], [0, 0, 1]], distortion: [], imageSize: [64, 48] } }))
  });
  await page.locator('button[data-mode="scale"]').click();
  await page.locator('#scale-input').setInputFiles(namedSvgFiles(15, 'scale'));
  await page.locator('#scale-button').click();
  await expect(page.locator('#download-scale')).toBeEnabled();
  const request = await page.evaluate(() => window.__workerMessages.find(message => message.type === 'calibrateScale'));
  expect(request.groups.map(group => group.distanceM)).toEqual([0.3, 0.6, 1]);
  expect(request.groups.map(group => group.frames.length)).toEqual([5, 5, 5]);
  expect(request.groups.map(group => group.frames.map(frame => frame.name))).toEqual([
    ['scale-01.svg', 'scale-02.svg', 'scale-03.svg', 'scale-04.svg', 'scale-05.svg'],
    ['scale-06.svg', 'scale-07.svg', 'scale-08.svg', 'scale-09.svg', 'scale-10.svg'],
    ['scale-11.svg', 'scale-12.svg', 'scale-13.svg', 'scale-14.svg', 'scale-15.svg']
  ]);
});
