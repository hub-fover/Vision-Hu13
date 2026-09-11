import test from 'node:test';
import assert from 'node:assert/strict';

import { appendPoint, clampCompare, createInitialState } from '../web/js/ui-state.js';

test('appendPoint retains only the three newest immutable readings', () => {
  const original = [{ x: 0, y: 0, value: 0 }];
  const result = appendPoint(original, { x: 0.1, y: 0.1, value: 0.1 });
  const capped = appendPoint(appendPoint(result, { x: 0.2, y: 0.2, value: 0.2 }), { x: 0.3, y: 0.3, value: 0.3 });
  assert.equal(original.length, 1);
  assert.deepEqual(capped.map(point => point.value), [0.1, 0.2, 0.3]);
});

test('comparison position stays inside the usable range', () => {
  assert.equal(clampCompare(-1), 0);
  assert.equal(clampCompare(0.42), 0.42);
  assert.equal(clampCompare(2), 1);
});

test('initial state opens in compare view with no image data', () => {
  assert.deepEqual(createInitialState(), {
    screen: 'home', view: 'compare', mode: 'relative', compare: 0.5,
    image: null, imageBlob: null, depth: null, points: [], requestId: null,
  });
});
