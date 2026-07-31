import assert from "node:assert/strict";
import test from "node:test";

import { FusionWorkerClient } from "../../web/js/worker-client.js";

test("cancel rejects while input bitmaps are still decoding", async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  let finishDecode;
  const client = new FusionWorkerClient(() => {
    throw new Error("Worker must not start after cancellation.");
  });

  try {
    globalThis.createImageBitmap = () => new Promise((resolve) => { finishDecode = resolve; });
    const fusion = client.fuse([{ name: "dark.jpg" }, { name: "normal.jpg" }, { name: "bright.jpg" }]);
    assert.equal(typeof finishDecode, "function");

    client.cancel();
    const outcome = await Promise.race([
      fusion.then(() => "resolved", (error) => error.code),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]);

    assert.equal(outcome, "CANCELLED");
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    finishDecode?.({ close() {} });
  }
});
