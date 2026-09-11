import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShareCaption, normalizeSharePoints } from '../web/js/share-card.js';

test('relative share text never claims physical units', () => {
  const caption = buildShareCaption([{ value: 0.72 }], 'relative');
  assert.equal(caption, 'P1 相对深度 72%');
  assert.doesNotMatch(caption, /\bm\b|米/);
});

test('metric share text formats valid readings in metres', () => {
  assert.equal(buildShareCaption([{ value: 4.826 }], 'metric'), 'P1 4.83 m');
});

test('share points are capped at three and clamped to the image', () => {
  const result = normalizeSharePoints([
    { x: -1, y: 2, value: 1 }, { x: 0.2, y: 0.3, value: 2 },
    { x: 0.4, y: 0.5, value: 3 }, { x: 0.6, y: 0.7, value: 4 },
  ]);
  assert.deepEqual(result.map(({ x, y, value }) => ({ x, y, value })), [
    { x: 0, y: 1, value: 1 }, { x: 0.2, y: 0.3, value: 2 }, { x: 0.4, y: 0.5, value: 3 },
  ]);
});
