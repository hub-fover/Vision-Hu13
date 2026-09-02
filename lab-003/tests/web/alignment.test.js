import assert from "node:assert/strict";
import test from "node:test";
import { applySimilarity, estimateSimilarityRansac, validateAlignment } from "../../web/js/alignment.js";
import { DEFAULTS } from "../../web/js/contracts.js";

test("deterministic RANSAC recovers a similarity transform with outliers", () => {
  const expected = [1.01, -0.02, 4, 0.02, 1.01, -3];
  const source = Array.from({ length: 40 }, (_, index) => [index % 8 * 18 + 5, Math.floor(index / 8) * 21 + 7]);
  const target = source.map((point) => applySimilarity(expected, point));
  target[4] = [600, 700];
  target[17] = [-300, 100];
  const result = validateAlignment(estimateSimilarityRansac(source, target), 320, 240, DEFAULTS);
  result.matrix.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-5));
  assert.equal(result.metrics.inlierCount, 38);
  assert.ok(result.metrics.medianReprojectionErrorPx < 1e-6);
});

test("implausible camera movement is rejected", () => {
  assert.throws(() => validateAlignment({
    matrix: [1, 0, 90, 0, 1, 0],
    metrics: { inlierCount: 40, inlierRatio: 1, medianReprojectionErrorPx: 0 },
  }, 320, 240, DEFAULTS), { code: "ALIGNMENT_FAILED" });
});
