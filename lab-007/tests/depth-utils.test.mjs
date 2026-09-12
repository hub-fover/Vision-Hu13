import test from 'node:test';
import assert from 'node:assert/strict';

import {
  depthToTurboRgb,
  formatMetricDepth,
  formatRelativeDepth,
  mapPointerToImage,
  normalizeDepth,
  sampleDepth,
} from '../web/js/depth-utils.js';

test('normalizeDepth returns finite Float32 values in zero-to-one range', () => {
  const result = normalizeDepth(new Float32Array([2, 4, Number.NaN, 6]));
  assert.ok(result instanceof Float32Array);
  assert.deepEqual(Array.from(result), [0, 0.5, 0.5, 1]);
});

test('normalizeDepth maps a constant finite field to the midpoint', () => {
  assert.deepEqual(Array.from(normalizeDepth([5, 5])), [0.5, 0.5]);
});

test('sampleDepth clamps normalized coordinates to matrix bounds', () => {
  const depth = new Float32Array([0, 0.25, 0.5, 0.75]);
  assert.equal(sampleDepth(depth, 2, 2, -1, -1), 0);
  assert.equal(sampleDepth(depth, 2, 2, 2, 2), 0.75);
});

test('mapPointerToImage rejects clicks in contain letterboxing', () => {
  const rect = { left: 0, top: 0, width: 400, height: 400 };
  assert.equal(mapPointerToImage(200, 20, rect, 400, 200), null);
  assert.deepEqual(mapPointerToImage(200, 200, rect, 400, 200), { x: 0.5, y: 0.5 });
});

test('depth colors and labels preserve unit boundaries', () => {
  assert.deepEqual(depthToTurboRgb(0), [48, 18, 59]);
  assert.deepEqual(depthToTurboRgb(1), [122, 4, 3]);
  assert.equal(formatRelativeDepth(0.826), '相对深度 83%');
  assert.equal(formatMetricDepth(4.826), '4.83 m');
  assert.doesNotMatch(formatRelativeDepth(0.826), /\bm\b|米/);
});
