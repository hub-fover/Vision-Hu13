import test from 'node:test';
import assert from 'node:assert/strict';

import { computeScaledSize, prepareImageBlob, validateImageFile } from '../web/js/image-utils.js';

test('validateImageFile accepts browser-decodable image media', () => {
  assert.doesNotThrow(() => validateImageFile({ type: 'image/jpeg', size: 1024 }));
  assert.doesNotThrow(() => validateImageFile({ type: 'image/heic', size: 1024 }));
});

test('validateImageFile rejects non-images and files over 20 MiB', () => {
  assert.throws(() => validateImageFile({ type: 'text/plain', size: 10 }), /图片/);
  assert.throws(() => validateImageFile({ type: 'image/svg+xml', size: 10 }), /格式/);
  assert.throws(() => validateImageFile({ type: 'image/jpeg', size: 0 }), /空文件/);
  assert.throws(() => validateImageFile({ type: 'image/jpeg', size: 20 * 1024 * 1024 + 1 }), /20 MB/);
});

test('computeScaledSize preserves aspect ratio and caps the longest edge', () => {
  assert.deepEqual(computeScaledSize(4000, 3000, 1280), { width: 1280, height: 960 });
  assert.deepEqual(computeScaledSize(640, 480, 1280), { width: 640, height: 480 });
  assert.throws(() => computeScaledSize(0, 480, 1280), /尺寸/);
});

test('prepareImageBlob decodes orientation, resizes, encodes JPEG, and closes the bitmap', async () => {
  const calls = [];
  const bitmap = { width: 4000, height: 3000, close: () => calls.push('close') };
  const context = { drawImage: (...args) => calls.push(['drawImage', ...args]) };
  const encoded = new Blob(['jpeg'], { type: 'image/jpeg' });
  const result = await prepareImageBlob(new Blob(['source'], { type: 'image/jpeg' }), {
    decode: async (file, options) => {
      calls.push(['decode', file.type, options]);
      return bitmap;
    },
    createCanvas: (width, height) => ({
      width,
      height,
      getContext: type => type === '2d' ? context : null,
      convertToBlob: async options => {
        calls.push(['convertToBlob', options]);
        return encoded;
      },
    }),
  });
  assert.deepEqual({ width: result.width, height: result.height, blob: result.blob }, {
    width: 1280,
    height: 960,
    blob: encoded,
  });
  assert.deepEqual(calls[0], ['decode', 'image/jpeg', { imageOrientation: 'from-image' }]);
  assert.deepEqual(calls[1], ['drawImage', bitmap, 0, 0, 1280, 960]);
  assert.deepEqual(calls[2], ['convertToBlob', { type: 'image/jpeg', quality: 0.88 }]);
  assert.equal(calls.at(-1), 'close');
});
