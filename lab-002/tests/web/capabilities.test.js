import assert from "node:assert/strict";
import test from "node:test";

import {
  canShareFiles,
  compatibilityMessage,
  decodeImageBitmap,
  shareFallbackMessage,
  supportsImageBitmap,
} from "../../web/js/capabilities.js";

test("image decoding support is checked before a mobile user chooses photos", () => {
  assert.equal(supportsImageBitmap({ createImageBitmap() {} }), true);
  assert.equal(supportsImageBitmap({}), false);
  assert.match(
    compatibilityMessage({}),
    /iPhone.*更新 iOS.*Android.*Chrome/,
  );
  assert.equal(
    compatibilityMessage({ createImageBitmap() {} }),
    "",
  );
});

test("image decoding retries without orientation options for older WebKit", async () => {
  const calls = [];
  const expected = { width: 100, height: 80 };
  const scope = {
    async createImageBitmap(_file, options) {
      calls.push(options);
      if (options) throw new TypeError("options unsupported");
      return expected;
    },
  };

  assert.equal(await decodeImageBitmap({ name: "photo.jpg" }, scope), expected);
  assert.deepEqual(calls, [{ imageOrientation: "from-image" }, undefined]);
});

test("file sharing requires both Web Share and a positive canShare result", () => {
  const file = { name: "panorama.jpg", type: "image/jpeg" };
  assert.equal(canShareFiles({}, file), false);
  assert.equal(
    canShareFiles({ share() {}, canShare: () => false }, file),
    false,
  );
  assert.equal(
    canShareFiles({ share() {}, canShare: ({ files }) => files[0] === file }, file),
    true,
  );
});

test("share fallback tells iPhone users how to save without hiding the result", () => {
  assert.match(shareFallbackMessage(), /长按上方结果图/);
  assert.match(shareFallbackMessage(), /下载 JPEG/);
});
