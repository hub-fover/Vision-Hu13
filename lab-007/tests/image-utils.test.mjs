import test from 'node:test';
import assert from 'node:assert/strict';

import { computeScaledSize, validateImageFile } from '../web/js/image-utils.js';

test('validateImageFile accepts browser-decodable image media', () => {
  assert.doesNotThrow(() => validateImageFile({ type: 'image/jpeg', size: 1024 }));
  assert.doesNotThrow(() => validateImageFile({ type: 'image/heic', size: 1024 }));
});

test('validateImageFile rejects non-images and files over 20 MiB', () => {
  assert.throws(() => validateImageFile({ type: 'text/plain', size: 10 }), /图片/);
  assert.throws(() => validateImageFile({ type: 'image/jpeg', size: 20 * 1024 * 1024 + 1 }), /20 MB/);
});

test('computeScaledSize preserves aspect ratio and caps the longest edge', () => {
  assert.deepEqual(computeScaledSize(4000, 3000, 1280), { width: 1280, height: 960 });
  assert.deepEqual(computeScaledSize(640, 480, 1280), { width: 640, height: 480 });
  assert.throws(() => computeScaledSize(0, 480, 1280), /尺寸/);
});
