import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHomography,
  composeTransforms,
  planCanvas,
} from "../../web/js/geometry.js";

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const translate = (x, y = 0) => [1, 0, x, 0, 1, y, 0, 0, 1];

test("applyHomography normalizes projective coordinates", () => {
  assert.deepEqual(
    applyHomography([2, 0, 10, 0, 3, 6, 0.01, 0, 1], [20, 10])
      .map((value) => Number(value.toFixed(6))),
    [41.666667, 30],
  );
});

test("composeTransforms anchors an odd sequence on its middle image", () => {
  const composed = composeTransforms([translate(100), translate(100)], {
    imageCount: 3,
  });

  assert.deepEqual(composed[0], translate(100));
  assert.deepEqual(composed[1], identity);
  assert.deepEqual(composed[2], translate(-100));
});

test("canvas planning caps mobile output at 12MP and includes memory evidence", () => {
  const plan = planCanvas(
    [{ width: 5000, height: 3000 }, { width: 5000, height: 3000 }],
    [identity, translate(4500)],
    { quality: "mobile" },
  );

  assert.ok(plan.width * plan.height <= 12_000_000);
  assert.ok(plan.outputScale < 1);
  assert.ok(plan.estimatedWorkingSetMiB <= 384);
  assert.equal(plan.sourceBytesPerPixel, 4);
  assert.ok(plan.exposureTemporaryBytes > 0);
});

test("RGBA source Mats can exhaust the budget before a canvas is allocated", () => {
  assert.throws(
    () => planCanvas(
      [{ width: 10000, height: 5000 }, { width: 10000, height: 5000 }],
      [identity, identity],
    ),
    (error) => error.code === "OUTPUT_TOO_LARGE",
  );
});

test("composition and corner failures retain adjacent pair context", () => {
  assert.throws(
    () => composeTransforms(
      [[1, 0, 0, 0, 1, 0, 0, 0, 0]],
      { imageCount: 2, pairNames: [["left.jpg", "right.jpg"]] },
    ),
    (error) => error.code === "HOMOGRAPHY_UNSTABLE" &&
      error.pairIndex === 0 &&
      error.pairNames.join(",") === "left.jpg,right.jpg",
  );

  assert.throws(
    () => planCanvas(
      [
        { name: "left.jpg", width: 100, height: 80 },
        { name: "right.jpg", width: 100, height: 80 },
      ],
      [identity, [1, 0, 0, 0, 1, 0, 0, 0, 0]],
    ),
    (error) => error.code === "HOMOGRAPHY_UNSTABLE" &&
      error.pairIndex === 0 &&
      error.pairNames.join(",") === "left.jpg,right.jpg",
  );
});

test("canvas planning fails clearly when source allocations alone exceed 384MiB", () => {
  assert.throws(
    () => planCanvas(
      [{ width: 18000, height: 12000 }, { width: 18000, height: 12000 }],
      [identity, identity],
    ),
    (error) => error.code === "OUTPUT_TOO_LARGE",
  );
});
