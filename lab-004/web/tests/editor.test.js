import test from 'node:test';
import assert from 'node:assert/strict';
import { clampRoi, moveRoi, nearestRoiHandle, resizeRoi } from '../js/editor.js';

test('moving an ROI accumulates the complete drag delta', () => {
  const start = { x: 220, y: 110, width: 180, height: 120 };
  assert.deepEqual(moveRoi(start, { x: -70, y: -45 }), { x: 150, y: 65, width: 180, height: 120 });
});

test('resizing a corner keeps the opposite edge fixed and respects minimum size', () => {
  const start = { x: 220, y: 110, width: 180, height: 120 };
  assert.deepEqual(resizeRoi(start, 0, { x: -70, y: -45 }), { x: 150, y: 65, width: 250, height: 165 });
  assert.deepEqual(resizeRoi(start, 0, { x: 300, y: 300 }), { x: 336, y: 166, width: 64, height: 64 });
});

test('ROI hit testing uses a touch-sized radius', () => {
  const roi = { x: 220, y: 110, width: 180, height: 120 };
  assert.equal(nearestRoiHandle({ x: 195, y: 90 }, roi), 0);
  assert.equal(nearestRoiHandle({ x: 180, y: 80 }, roi), -1);
});

test('clamping never lets an ROI leave the analysis canvas', () => {
  assert.deepEqual(clampRoi({ x: -20, y: -30, width: 700, height: 500 }), { x: 0, y: 0, width: 640, height: 360 });
});
