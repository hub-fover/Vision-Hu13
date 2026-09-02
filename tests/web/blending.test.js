import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyBrightness, applySaturation, applyTexture, applyTint, blendChannel,
  blendComposite, blurPremultiplied, fitAssetPixels, normalizeShadow, premultiplyRgba,
  samplePremultipliedBilinear,
  unpremultiplyRgba,
} from "../../web/js/blending.js";

test("normal, multiply, and W3C soft-light channels", () => {
  assert.equal(blendChannel(0.4, 0.8, "normal"), 0.8);
  assert.ok(Math.abs(blendChannel(0.4, 0.8, "multiply") - 0.32) < 1e-12);
  const d = Math.sqrt(0.4);
  assert.ok(Math.abs(blendChannel(0.4, 0.8, "soft-light") -
    (0.4 + (2 * 0.8 - 1) * (d - 0.4))) < 1e-12);
  assert.throws(() => blendChannel(0.4, 0.8, "screen"), /normal, multiply, or soft-light/);
});

test("brightness gain is clamped to 0.6 through 1.4", () => {
  const source = new Uint8ClampedArray([10, 20, 30, 255]);
  assert.deepEqual([...applyBrightness(source, 4)], [14, 28, 42, 255]);
  assert.deepEqual([...applyBrightness(source, 0.1)], [6, 12, 18, 255]);
});

test("tint and saturation preserve alpha", () => {
  const source = new Uint8ClampedArray([100, 150, 200, 128]);
  assert.deepEqual([...applyTint(source, [200, 100, 50], 0.5)], [150, 125, 125, 128]);
  const gray = applySaturation(source, 0);
  assert.equal(gray[0], gray[1]);
  assert.equal(gray[1], gray[2]);
  assert.equal(gray[3], 128);
});

test("texture strength zero is a byte-for-byte no-op", () => {
  const source = new Uint8ClampedArray([10, 20, 30, 40, 50, 60, 70, 80]);
  const result = applyTexture(source, new Float32Array(source.length / 4), 0);
  assert.notEqual(result, source);
  assert.deepEqual([...result], [...source]);
});

test("shadow settings are clamped and defaults are explicit", () => {
  assert.deepEqual(normalizeShadow({ enabled: true, offsetX: "5", opacity: 2 }), {
    enabled: true, offsetX: 5, offsetY: 8, blur: 12, opacity: 1,
  });
  assert.deepEqual(normalizeShadow(null), {
    enabled: false, offsetX: 8, offsetY: 8, blur: 12, opacity: 0.35,
  });
});

test("premultiplication round trips translucent color", () => {
  const straight = [200, 100, 50, 128];
  const premultiplied = premultiplyRgba(straight);
  assert.ok(premultiplied[0] < straight[0]);
  const restored = unpremultiplyRgba(premultiplied);
  restored.forEach((value, index) => assert.ok(Math.abs(value - straight[index]) <= 1));
});

test("premultiplied bilinear sampling avoids transparent dark halos", () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 0, 0, 0,
    255, 0, 0, 255, 0, 0, 0, 0,
  ]);
  const sampled = samplePremultipliedBilinear(pixels, 2, 2, 0.5, 0.5);
  assert.ok(sampled[0] >= 254);
  assert.equal(sampled[1], 0);
  assert.equal(sampled[2], 0);
  assert.ok(sampled[3] >= 127 && sampled[3] <= 128);
});

test("opacity zero returns exact background bytes and dimensions", () => {
  const background = {
    data: new Uint8ClampedArray([3, 7, 11, 255, 13, 17, 19, 255]),
    width: 2, height: 1,
  };
  const asset = {
    data: new Uint8ClampedArray([255, 0, 0, 255]),
    width: 1, height: 1,
  };
  const result = blendComposite(background, asset,
    [[0, 0], [1, 0], [1, 0.9], [0, 0.9]], { opacity: 0 });
  assert.equal(result.width, 2);
  assert.equal(result.height, 1);
  assert.deepEqual([...result.data], [...background.data]);
});

test("contain pads transparently while fill covers the target", () => {
  const asset = {
    width: 4,
    height: 2,
    data: new Uint8ClampedArray(4 * 2 * 4).fill(255),
  };
  const contained = fitAssetPixels(asset, 4, 4, "contain");
  assert.equal(contained.data[3], 0);
  assert.equal(contained.data[(1 * 4) * 4 + 3], 255);
  const filled = fitAssetPixels(asset, 2, 2, "fill");
  for (let index = 3; index < filled.data.length; index += 4) {
    assert.equal(filled.data[index], 255);
  }
});

test("premultiplied blur spreads translucent color without a dark halo", () => {
  const source = new Uint8ClampedArray(5 * 5 * 4);
  source.set([255, 0, 0, 128], (2 * 5 + 2) * 4);
  const blurred = blurPremultiplied(source, 5, 5, 1);
  const adjacent = [...blurred.slice((2 * 5 + 1) * 4, (2 * 5 + 1) * 4 + 4)];
  assert.ok(adjacent[3] > 0 && adjacent[3] < 128);
  assert.ok(adjacent[0] >= 250);
  assert.equal(adjacent[1], 0);
  assert.equal(adjacent[2], 0);
});

test("blur uses only two byte-sized RGBA buffers and no full float RGBA buffers", async () => {
  const source = await readFile(
    new URL("../../web/js/blending.js", import.meta.url), "utf8");
  const body = source.slice(
    source.indexOf("export function blurPremultiplied"),
    source.indexOf("function backgroundHighFrequency"),
  );
  assert.doesNotMatch(body, /Float32Array/);
  assert.equal(
    [...body.matchAll(/new Uint8ClampedArray\(source\.length\)/g)].length,
    2,
  );
});

test("blendComposite scales blurPx by background long edge", () => {
  const background = {
    width: 7, height: 7,
    data: new Uint8ClampedArray(7 * 7 * 4),
  };
  for (let index = 3; index < background.data.length; index += 4) {
    background.data[index] = 255;
  }
  const asset = {
    width: 2, height: 2,
    data: new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255,
    ]),
  };
  const quad = [[3, 3], [4, 3], [4, 4], [3, 4]];
  const baseOptions = {
    opacity: 1, blendMode: "normal", brightnessMatch: false,
    tintStrength: 0, textureStrength: 0, saturation: 1, fitMode: "fill",
  };
  const sharp = blendComposite(background, asset, quad, { ...baseOptions, blurPx: 0 });
  const soft = blendComposite(background, asset, quad, {
    ...baseOptions, blurPx: 1080 / 7,
  });
  const adjacent = (3 * 7 + 2) * 4;
  assert.equal(sharp.data[adjacent], 0);
  assert.ok(soft.data[adjacent] > 0);
});

test("blendComposite applies target background high-frequency texture", () => {
  const background = { width: 5, height: 5, data: new Uint8ClampedArray(5 * 5 * 4) };
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const value = (x + y) % 2 ? 240 : 20;
      background.data.set([value, value, value, 255], (y * 5 + x) * 4);
    }
  }
  const assetData = new Uint8ClampedArray(5 * 5 * 4);
  for (let index = 0; index < assetData.length; index += 4) {
    assetData.set([128, 128, 128, 255], index);
  }
  const asset = { width: 5, height: 5, data: assetData };
  const quad = [[0, 0], [4, 0], [4, 4], [0, 4]];
  const options = {
    opacity: 1, blendMode: "normal", brightnessMatch: false, tintStrength: 0,
    blurPx: 0, saturation: 1, fitMode: "fill",
  };
  const plain = blendComposite(background, asset, quad, {
    ...options, textureStrength: 0,
  });
  const textured = blendComposite(background, asset, quad, {
    ...options, textureStrength: 1,
  });
  assert.equal(plain.data[(2 * 5 + 2) * 4], 128);
  assert.notEqual(textured.data[(2 * 5 + 2) * 4],
    textured.data[(2 * 5 + 3) * 4]);
});
