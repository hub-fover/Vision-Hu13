import test from 'node:test';
import assert from 'node:assert/strict';

import { createDepthEngine } from '../web/js/depth-engine.js';

class FakeWorker {
  static instances = [];
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.messages = [];
    this.listeners = new Map();
    this.terminated = false;
    FakeWorker.instances.push(this);
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(data) { this.listeners.get('message')?.({ data }); }
}

test('depth engine resolves a transferred Float32 result for the matching request', async () => {
  const engine = createDepthEngine({ workerUrl: './depth.worker.js', WorkerClass: FakeWorker });
  const promise = engine.infer(new Blob(['image'], { type: 'image/jpeg' }));
  const worker = FakeWorker.instances.at(-1);
  const requestId = worker.messages[0].requestId;
  worker.emit({ type: 'result', requestId, width: 2, height: 1, depth: new Float32Array([0, 1]).buffer, model: 'Depth Anything V2 Small', revision: 'abc', backend: 'wasm' });
  const result = await promise;
  assert.ok(result.depth instanceof Float32Array);
  assert.deepEqual(Array.from(result.depth), [0, 1]);
  assert.equal(result.mode, 'relative');
  engine.dispose();
});

test('cancel rejects the active request and ignores its late result', async () => {
  const engine = createDepthEngine({ workerUrl: './depth.worker.js', WorkerClass: FakeWorker });
  const promise = engine.infer(new Blob(['image'], { type: 'image/jpeg' }));
  const worker = FakeWorker.instances.at(-1);
  const requestId = worker.messages[0].requestId;
  engine.cancel();
  worker.emit({ type: 'result', requestId, width: 1, height: 1, depth: new Float32Array([1]).buffer });
  await assert.rejects(promise, error => error.name === 'AbortError');
  assert.equal(worker.messages.at(-1).type, 'cancel');
  engine.dispose();
});

test('starting a second inference cancels the first before posting the next request', async () => {
  const engine = createDepthEngine({ workerUrl: './depth.worker.js', WorkerClass: FakeWorker });
  const first = engine.infer(new Blob(['first'], { type: 'image/jpeg' }));
  const second = engine.infer(new Blob(['second'], { type: 'image/jpeg' }));
  const worker = FakeWorker.instances.at(-1);
  await assert.rejects(first, error => error.name === 'AbortError');
  const inferMessages = worker.messages.filter(message => message.type === 'infer');
  assert.equal(inferMessages.length, 2);
  worker.emit({ type: 'result', requestId: inferMessages[1].requestId, width: 1, height: 1, depth: new Float32Array([0.5]).buffer, model: 'Depth Anything V2 Small', revision: 'abc', backend: 'wasm' });
  assert.equal((await second).depth[0], 0.5);
  engine.dispose();
});
