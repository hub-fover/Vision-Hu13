import test from 'node:test';
import assert from 'node:assert/strict';

import { extractDepthTensor, loadPipelineWithFallback } from '../web/js/worker-core.js';

test('extractDepthTensor reads trailing dimensions and normalizes finite values', () => {
  const result = {
    predicted_depth: {
      dims: [1, 1, 2, 3],
      data: new Float32Array([10, 20, 30, 40, 50, 60]),
    },
  };
  const extracted = extractDepthTensor(result);
  assert.equal(extracted.width, 3);
  assert.equal(extracted.height, 2);
  assert.equal(extracted.depth[0], 0);
  assert.equal(extracted.depth.at(-1), 1);
  [0.2, 0.4, 0.6, 0.8].forEach((expected, index) => {
    assert.ok(Math.abs(extracted.depth[index + 1] - expected) < 1e-6);
  });
});

test('extractDepthTensor rejects malformed model output', () => {
  assert.throws(() => extractDepthTensor({ predicted_depth: { dims: [1, 2], data: [1] } }), /尺寸/);
  assert.throws(() => extractDepthTensor({}), /深度矩阵/);
});

test('loadPipelineWithFallback tries WASM after WebGPU initialization fails', async () => {
  const attempts = [];
  const createPipeline = async (_task, _model, options) => {
    attempts.push(options.device);
    if (options.device === 'webgpu') throw new Error('adapter unavailable');
    return async () => ({ predicted_depth: { dims: [1, 1], data: [1] } });
  };
  const loaded = await loadPipelineWithFallback({
    plan: [
      { backend: 'webgpu', device: 'webgpu', dtype: 'q4' },
      { backend: 'wasm', device: 'wasm', dtype: 'q4' },
    ],
    createPipeline,
    modelId: 'model',
    revision: 'revision',
    onProgress: () => {},
  });
  assert.deepEqual(attempts, ['webgpu', 'wasm']);
  assert.equal(loaded.backend, 'wasm');
  assert.equal(typeof loaded.pipeline, 'function');
});

test('loadPipelineWithFallback reports every backend failure', async () => {
  await assert.rejects(
    loadPipelineWithFallback({
      plan: [
        { backend: 'webgpu', device: 'webgpu', dtype: 'q4' },
        { backend: 'wasm', device: 'wasm', dtype: 'q4' },
      ],
      createPipeline: async (_task, _model, options) => { throw new Error(`${options.device} failed`); },
      modelId: 'model',
      revision: 'revision',
      onProgress: () => {},
    }),
    /webgpu: webgpu failed.*wasm: wasm failed/,
  );
});
