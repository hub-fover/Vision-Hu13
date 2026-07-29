import assert from "node:assert/strict";
import test from "node:test";

import { StitchWorkerClient } from "../../web/js/worker-client.js";

test("cancel terminates synchronous work, closes transfers, and starts fresh", async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const bitmaps = [];
  const workers = [];
  globalThis.createImageBitmap = async () => {
    const bitmap = {
      closeCount: 0,
      close() {
        this.closeCount += 1;
      },
    };
    bitmaps.push(bitmap);
    return bitmap;
  };
  const factory = () => {
    const listeners = new Set();
    const worker = {
      terminated: 0,
      addEventListener(type, listener) {
        if (type === "message") listeners.add(listener);
      },
      postMessage(message) {
        if (message.type === "cancel") {
          for (const listener of listeners) {
            listener({
              data: {
                type: "error",
                jobId: message.jobId,
                error: { code: "CANCELLED", message: "cancelled" },
              },
            });
          }
        }
      },
      terminate() {
        this.terminated += 1;
      },
    };
    workers.push(worker);
    return worker;
  };

  try {
    const client = new StitchWorkerClient(factory);
    const first = client.stitch([{ name: "left.jpg", file: {} }]);
    await new Promise((resolve) => setImmediate(resolve));
    client.cancel();
    await assert.rejects(first, (error) => error.code === "CANCELLED");
    assert.equal(workers[0].terminated, 1);
    assert.equal(bitmaps[0].closeCount, 1);

    const second = client.stitch([{ name: "right.jpg", file: {} }]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(workers.length, 2);
    client.cancel();
    await assert.rejects(second, (error) => error.code === "CANCELLED");
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
});

test("a Worker startup error rejects instead of leaving the UI running forever", async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const bitmap = {
    closeCount: 0,
    close() {
      this.closeCount += 1;
    },
  };
  globalThis.createImageBitmap = async () => bitmap;
  const listeners = new Map();
  const worker = {
    terminated: 0,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    postMessage() {},
    terminate() {
      this.terminated += 1;
    },
  };

  try {
    const client = new StitchWorkerClient(() => worker);
    const result = client.stitch([{ name: "left.jpg", file: {} }]);
    await new Promise((resolve) => setImmediate(resolve));
    listeners.get("error")({
      message: "worker bootstrap failed",
      error: new Error("worker bootstrap failed"),
      preventDefault() {},
    });
    await assert.rejects(
      result,
      (error) =>
        error.code === "DECODE_FAILED" &&
        error.message === "worker bootstrap failed",
    );
    assert.equal(bitmap.closeCount, 1);
    assert.equal(worker.terminated, 1);
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
});
