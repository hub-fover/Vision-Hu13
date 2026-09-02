import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_INPUT_PIXELS, assertPixelLimit, createExactRenderController,
} from "../../web/js/exact-render.js";

function harness() {
  const timers = new Map();
  const workers = [];
  let timerId = 0;
  const controller = createExactRenderController({
    createWorker() {
      const worker = {
        messages: [],
        terminated: false,
        postMessage(message) { this.messages.push(message); },
        terminate() { this.terminated = true; },
      };
      workers.push(worker);
      return worker;
    },
    setTimeoutFn(callback) {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeoutFn(id) { timers.delete(id); },
    onResult() {},
    onError() {},
  });
  return {
    controller,
    workers,
    flushLatest() {
      const latest = [...timers.entries()].at(-1);
      assert.ok(latest);
      timers.delete(latest[0]);
      latest[1]();
    },
  };
}

const payload = (id) => ({
  id,
  background: { width: 2, height: 2, data: new Uint8ClampedArray(16) },
  asset: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
  quad: [[0, 0], [1, 0], [1, 1], [0, 1]],
  options: {},
});

test("rapid debounced requests collapse to the latest after 180ms", () => {
  const subject = harness();
  subject.controller.request(payload(1));
  subject.controller.request(payload(2));
  subject.controller.request(payload(3));
  assert.equal(subject.workers.length, 0);
  subject.flushLatest();
  assert.equal(subject.workers.length, 1);
  assert.deepEqual(subject.workers[0].messages.map((message) => message.id), [3]);
});

test("a newer immediate render cancels the active worker before starting", () => {
  const subject = harness();
  subject.controller.request(payload(1), { immediate: true });
  subject.controller.request(payload(2), { immediate: true });
  assert.equal(subject.workers.length, 2);
  assert.equal(subject.workers[0].terminated, true);
  assert.deepEqual(subject.workers[1].messages.map((message) => message.id), [2]);
});

test("input dimensions above 4K UHD fail with Chinese guidance", () => {
  assert.equal(MAX_INPUT_PIXELS, 8_294_400);
  assert.doesNotThrow(() => assertPixelLimit(3840, 2160));
  assert.throws(() => assertPixelLimit(3841, 2160), /图片.*4K.*8,294,400.*缩小/);
});
