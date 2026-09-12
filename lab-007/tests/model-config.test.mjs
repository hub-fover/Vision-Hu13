import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MODEL_ID,
  MODEL_REVISION,
  configureTransformers,
  createInferencePlan,
} from '../web/js/model-config.js';

test('inference plan uses pinned q4 model and falls back from WebGPU to WASM', () => {
  assert.equal(MODEL_ID, 'onnx-community/depth-anything-v2-small');
  assert.equal(MODEL_REVISION, '4472b7362082ad9968fee890ca0f1e5aca36b93d');
  assert.deepEqual(createInferencePlan({ hasWebGpu: true }), [
    { backend: 'webgpu', device: 'webgpu', dtype: 'q4' },
    { backend: 'wasm', device: 'wasm', dtype: 'q4' },
  ]);
  assert.deepEqual(createInferencePlan({ hasWebGpu: false }), [
    { backend: 'wasm', device: 'wasm', dtype: 'q4' },
  ]);
});

test('Transformers environment uses browser cache and same-origin single-threaded WASM', () => {
  const env = { backends: { onnx: { wasm: {} } } };
  configureTransformers(env, 'https://example.test/lab-007/vendor/');
  assert.equal(env.allowRemoteModels, true);
  assert.equal(env.allowLocalModels, false);
  assert.equal(env.useBrowserCache, true);
  assert.equal(env.backends.onnx.wasm.numThreads, 1);
  assert.equal(env.backends.onnx.wasm.wasmPaths, 'https://example.test/lab-007/vendor/');
});
