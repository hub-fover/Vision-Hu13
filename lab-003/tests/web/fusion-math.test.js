import assert from "node:assert/strict";
import test from "node:test";
import { cropCommonRegion, largestRectangle } from "../../web/js/crop.js";
import { detectMotion, protectMotion } from "../../web/js/motion.js";
import { fusePyramids } from "../../web/js/pyramid.js";
import { computeQualityWeights } from "../../web/js/weights.js";
import { DEFAULTS } from "../../web/js/contracts.js";

function patterned(width, height, shift = 0) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const value = (pixel * 17 + shift) % 220 + 18;
    data.set([value, Math.min(255, value + 11), Math.max(0, value - 9), 255], pixel * 4);
  }
  return { width, height, data };
}

test("quality weights normalize per pixel", () => {
  const images = [patterned(12, 10), patterned(12, 10, 25), patterned(12, 10, 50)];
  const { weights } = computeQualityWeights(images, DEFAULTS);
  for (let pixel = 0; pixel < 120; pixel += 1) {
    assert.ok(Math.abs(weights[0][pixel] + weights[1][pixel] + weights[2][pixel] - 1) < 1e-5);
  }
});

test("motion protection selects the middle exposure", () => {
  const images = [patterned(8, 8), patterned(8, 8), patterned(8, 8)];
  for (let y = 2; y <= 5; y += 1) {
    for (let x = 2; x <= 5; x += 1) images[2].data.set([255, 255, 255, 255], 4 * (y * 8 + x));
  }
  const mask = detectMotion(images, 10);
  const weights = [new Float32Array(64).fill(1 / 3), new Float32Array(64).fill(1 / 3), new Float32Array(64).fill(1 / 3)];
  protectMotion(weights, mask);
  assert.equal(weights[1][4 * 8 + 4], 1);
  assert.equal(weights[0][4 * 8 + 4], 0);
});

test("largest common crop stays hole-free and pyramid reconstructs an identity blend", () => {
  const mask = new Uint8Array(20 * 10).fill(255);
  mask.fill(0, 0, 20);
  assert.deepEqual(largestRectangle(mask, 20, 10), { x: 0, y: 1, width: 20, height: 9 });
  const crop = cropCommonRegion([mask, mask, mask], 20, 10, 0);
  assert.deepEqual(crop, { x: 0, y: 1, width: 20, height: 9 });
  const image = patterned(16, 12);
  const weights = [new Float32Array(192).fill(1), new Float32Array(192), new Float32Array(192)];
  const output = fusePyramids([image, image, image], weights, 5);
  assert.deepEqual(output.data, image.data);
});
