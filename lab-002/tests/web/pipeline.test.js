import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as panorama from "../../web/js/panorama.js";
import { StitchError, pairErrorMessage } from "../../web/js/errors.js";

const publicApis = [
  "extractFeatures",
  "matchPair",
  "estimateHomography",
  "composeTransforms",
  "warpImages",
  "blendPanorama",
  "autoCrop",
  "stitchImages",
];

test("the Web package exposes all eight teaching APIs", () => {
  assert.deepEqual(
    publicApis.filter((name) => typeof panorama[name] !== "function"),
    [],
  );
});

test("stitchImages rejects a one-image queue before loading OpenCV", async () => {
  await assert.rejects(
    panorama.stitchImages([{ name: "only.jpg" }]),
    (error) => error instanceof StitchError &&
      error.code === "NOT_ENOUGH_IMAGES",
  );
});

test("stitchImages processes adjacent pairs, composes around the middle, and releases resources", async () => {
  const calls = [];
  const released = [];
  const mask = new Uint8Array(8 * 8).fill(255);
  const adapter = {
    decode: async (source) => ({ ...source, mat: source.name }),
    extractFeatures: (image, options) => {
      calls.push(["extract", image.name, options.analysisMaxSide]);
      return { image: image.name };
    },
    matchPair: (left, right, options, context) => {
      calls.push(["match", left.image, right.image, context.pairIndex, context.pairNames]);
      return { pairIndex: context.pairIndex };
    },
    estimateHomography: (_left, _right, matches) => ({
      transform: [1, 0, 100, 0, 1, 0, 0, 0, 1],
      metrics: { pairIndex: matches.pairIndex },
    }),
    warpImages: (images, transforms) => {
      calls.push(["warp", images.length, transforms.map((item) => item[2])]);
      return { images, width: 8, height: 8, estimatedWorkingSetMiB: 12 };
    },
    blendPanorama: () => ({
      image: { kind: "rgba" },
      validMask: mask,
      seamMask: mask,
      exposureGains: [1, 1, 1],
    }),
    crop: (image, crop) => ({ image, crop }),
    encodeJpeg: async (_image, quality) => ({ type: "image/jpeg", quality }),
    release: (value) => released.push(value),
  };

  const result = await panorama.stitchImages([
    { name: "left.jpg", width: 100, height: 80 },
    { name: "middle.jpg", width: 100, height: 80 },
    { name: "right.jpg", width: 100, height: 80 },
  ], { adapter });

  assert.deepEqual(calls.filter(([name]) => name === "match"), [
    ["match", "left.jpg", "middle.jpg", 0, ["left.jpg", "middle.jpg"]],
    ["match", "middle.jpg", "right.jpg", 1, ["middle.jpg", "right.jpg"]],
  ]);
  assert.deepEqual(calls.find(([name]) => name === "warp"), [
    "warp",
    3,
    [100, 0, -100],
  ]);
  assert.deepEqual(result.crop, { x: 2, y: 2, width: 4, height: 4 });
  assert.equal(result.jpeg.type, "image/jpeg");
  assert.equal(result.jpeg.quality, 0.92);
  assert.equal(result.estimatedWorkingSetMiB, 12);
  assert.ok(released.length >= 9);
});

test("stitchImages turns cooperative cancellation into the shared error", async () => {
  let cancelled = false;
  const adapter = {
    decode: async (source) => source,
    extractFeatures: (image) => {
      cancelled = image.name === "right.jpg";
      return image;
    },
    release() {},
  };

  await assert.rejects(
    panorama.stitchImages([
      { name: "left.jpg" },
      { name: "right.jpg" },
    ], { adapter, isCancelled: () => cancelled }),
    (error) => error.code === "CANCELLED",
  );
});

test("pair failures identify both neighboring images in actionable Chinese", () => {
  assert.equal(
    pairErrorMessage(new StitchError(
      "INSUFFICIENT_OVERLAP",
      "capture more overlap",
      { pairIndex: 1, pairNames: ["中.jpg", "右.jpg"] },
    )),
    "第 2 组（中.jpg → 右.jpg）重叠不足。请多保留一些共同画面后重拍。",
  );
});

test("Worker lazy-loads a same-origin OpenCV build and never embeds an upload URL", async () => {
  const [worker, client] = await Promise.all([
    readFile(new URL("../../web/js/panorama.worker.js", import.meta.url), "utf8"),
    readFile(new URL("../../web/js/worker-client.js", import.meta.url), "utf8"),
  ]);

  assert.match(worker, /importScripts\(["']\.\.\/vendor\/opencv\.js["']\)/);
  assert.match(worker, /onmessage/);
  assert.match(worker, /import\(["']\.\/errors\.js["']\)/);
  assert.doesNotMatch(worker, /panoramaModule\.StitchError/);
  assert.match(client, /new Worker\(new URL\("\.\/panorama\.worker\.js", import\.meta\.url\)\)/);
  assert.doesNotMatch(`${worker}\n${client}`, /https?:\/\/|fetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("OpenCV adapter uses the required modules and contains explicit cleanup", async () => {
  const source = await readFile(
    new URL("../../web/js/opencv-adapter.js", import.meta.url),
    "utf8",
  );

  for (const required of [
    "ORB",
    "BFMatcher",
    "findHomography",
    "warpPerspective",
    "distanceTransform",
  ]) {
    assert.match(source, new RegExp(`\\.${required}\\b|new cv\\.${required}\\b`));
  }
  assert.match(source, /finally\s*{/);
  assert.match(source, /\.delete\(\)/);
});
