import { test, expect } from '@playwright/test';

test('pinned q4 model returns a finite non-constant depth matrix on WASM', async ({ page }) => {
  await page.goto('/');
  const backendShape = await page.evaluate(async () => {
    const { env } = await import('./vendor/transformers.web.min.js');
    return { keys: Object.keys(env.backends.onnx || {}), hasWasm: Boolean(env.backends.onnx?.wasm) };
  });
  console.log(`Transformers browser backend: ${JSON.stringify(backendShape)}`);
  const result = await page.evaluate(async () => {
    const response = await fetch('./assets/samples/person.jpg');
    const blob = await response.blob();
    const worker = new Worker('./js/depth.worker.js?backend=wasm', { type: 'module', name: 'lab007-model-smoke' });
    try {
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('model smoke timed out')), 330_000);
        worker.onerror = event => {
          clearTimeout(timeout);
          reject(new Error(JSON.stringify({ message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno })));
        };
        worker.onmessage = event => {
          if (event.data.type === 'error') {
            clearTimeout(timeout);
            reject(new Error(event.data.message));
          }
          if (event.data.type === 'result') {
            clearTimeout(timeout);
            const values = [...new Float32Array(event.data.depth)];
            resolve({ ...event.data, depth: values });
          }
        };
        worker.postMessage({ type: 'infer', requestId: 'model-smoke', blob });
      });
    } finally {
      worker.terminate();
    }
  });
  expect(result.model).toBe('Depth Anything V2 Small');
  expect(result.revision).toBe('4472b7362082ad9968fee890ca0f1e5aca36b93d');
  expect(result.backend).toBe('wasm');
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  expect(result.depth).toHaveLength(result.width * result.height);
  expect(result.depth.every(Number.isFinite)).toBe(true);
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of result.depth) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  expect(maximum - minimum).toBeGreaterThan(0.01);
});
