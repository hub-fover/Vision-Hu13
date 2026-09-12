import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerController } from '../web/js/worker-controller.js';

test('worker controller posts progress and transfers a normalized result', async () => {
  const posted = [];
  let loadCount = 0;
  const controller = createWorkerController({
    load: async onProgress => {
      loadCount += 1;
      onProgress({ status: 'progress', progress: 42, backend: 'wasm' });
      return {
        backend: 'wasm',
        pipeline: async source => {
          assert.equal(source, 'blob:test');
          return { predicted_depth: { dims: [1, 2], data: new Float32Array([2, 8]) } };
        },
      };
    },
    post: (message, transfer = []) => posted.push({ message, transfer }),
    createSourceUrl: () => 'blob:test',
    revokeSourceUrl: () => {},
    modelName: 'Depth Anything V2 Small',
    revision: 'revision',
  });

  await controller.handle({ type: 'infer', requestId: 'one', blob: new Blob(['x'], { type: 'image/jpeg' }) });
  const result = posted.find(entry => entry.message.type === 'result');
  assert.equal(loadCount, 1);
  assert.equal(result.message.requestId, 'one');
  assert.equal(result.message.width, 2);
  assert.equal(result.message.height, 1);
  assert.deepEqual(Array.from(new Float32Array(result.message.depth)), [0, 1]);
  assert.deepEqual(result.transfer, [result.message.depth]);
  assert.ok(posted.some(entry => entry.message.type === 'progress' && entry.message.progress.backend === 'wasm'));
});

test('worker controller reuses its loaded pipeline', async () => {
  let loadCount = 0;
  const controller = createWorkerController({
    load: async () => {
      loadCount += 1;
      return { backend: 'wasm', pipeline: async () => ({ predicted_depth: { dims: [1, 1], data: [1] } }) };
    },
    post: () => {},
    createSourceUrl: () => 'blob:test',
    revokeSourceUrl: () => {},
    modelName: 'Depth Anything V2 Small',
    revision: 'revision',
  });
  const blob = new Blob(['x'], { type: 'image/jpeg' });
  await controller.handle({ type: 'infer', requestId: 'one', blob });
  await controller.handle({ type: 'infer', requestId: 'two', blob });
  assert.equal(loadCount, 1);
});

test('worker controller returns a request-scoped error for malformed input', async () => {
  const posted = [];
  const controller = createWorkerController({
    load: async () => { throw new Error('should not load'); },
    post: message => posted.push(message),
    createSourceUrl: () => 'blob:test',
    revokeSourceUrl: () => {},
    modelName: 'Depth Anything V2 Small',
    revision: 'revision',
  });
  await controller.handle({ type: 'infer', requestId: 'bad', blob: 'not-a-blob' });
  assert.deepEqual(posted, [{ type: 'error', requestId: 'bad', message: '推理请求缺少图片数据' }]);
});
