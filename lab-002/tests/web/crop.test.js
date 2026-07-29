import assert from "node:assert/strict";
import test from "node:test";

import { autoCrop } from "../../web/js/crop.js";

test("autoCrop finds the largest hole-free rectangle and applies a 2px inset", () => {
  const width = 12;
  const height = 10;
  const mask = new Uint8Array(width * height);
  for (let y = 1; y < 9; y += 1) {
    for (let x = 1; x < 11; x += 1) mask[y * width + x] = 255;
  }
  mask[5 * width + 9] = 0;
  mask[6 * width + 9] = 0;
  mask[7 * width + 9] = 0;
  mask[8 * width + 9] = 0;

  assert.deepEqual(autoCrop(mask, width, height), {
    x: 3,
    y: 3,
    width: 4,
    height: 4,
  });
});

test("autoCrop rejects masks without room for the safety inset", () => {
  assert.throws(
    () => autoCrop(new Uint8Array(4 * 4).fill(255), 4, 4),
    (error) => error.code === "HOMOGRAPHY_UNSTABLE",
  );
});
