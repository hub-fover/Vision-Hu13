import assert from "node:assert/strict";
import test from "node:test";
import { blendComposite, warpAsset } from "../../web/js/blending.js";

test("inverse homography maps every destination pixel center to the source", () => {
  const asset = {
    width: 2, height: 2,
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]),
  };
  const warped = warpAsset(asset, [[0, 0], [1, 0], [1, 1], [0, 1]], 2, 2);
  assert.deepEqual([...warped.data], [...asset.data]);
});

test("full-resolution composite keeps source background dimensions", () => {
  const background = {
    width: 7, height: 5,
    data: new Uint8ClampedArray(7 * 5 * 4).fill(255),
  };
  const asset = {
    width: 1, height: 1,
    data: new Uint8ClampedArray([255, 0, 0, 255]),
  };
  const result = blendComposite(background, asset,
    [[1, 1], [5, 1], [5, 3], [1, 3]], { opacity: 1, blendMode: "normal" });
  assert.equal(result.width, 7);
  assert.equal(result.height, 5);
  assert.equal(result.data.length, 7 * 5 * 4);
});
