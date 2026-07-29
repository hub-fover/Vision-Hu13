import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("shared panorama contract exposes the agreed defaults and errors", async () => {
  const contract = JSON.parse(await readFile(new URL("shared/contracts.json", root), "utf8"));

  assert.deepEqual(contract.defaults, {
    analysisMaxSide: 1280,
    maxFeatures: 2500,
    ratioThreshold: 0.75,
    ransacThresholdPx: 3,
    minInliers: 20,
    minInlierRatio: 0.25,
    maxMedianErrorPx: 2.5,
    exposureGain: { min: 0.7, max: 1.3 },
    blendWidthPx: 96,
    outputMegapixels: { mobile: 12, hd: 24 },
    maxWorkingSetMiB: 384,
    warningThresholds: { imageCount: 6, sourceMegapixels: 60 },
    jpegQuality: 0.92,
  });
  assert.deepEqual(contract.errorCodes, [
    "NOT_ENOUGH_IMAGES", "UNSUPPORTED_FORMAT", "DECODE_FAILED", "LOW_TEXTURE",
    "INSUFFICIENT_OVERLAP", "AMBIGUOUS_MATCHES", "HOMOGRAPHY_UNSTABLE",
    "HIGH_REPROJECTION_ERROR", "OUTPUT_TOO_LARGE", "CANCELLED",
  ]);
});

test("contract documents the public option and matching metric fields", async () => {
  const contract = JSON.parse(await readFile(new URL("shared/contracts.json", root), "utf8"));

  assert.ok(contract.types.StitchOptions.description);
  assert.ok(contract.types.MatchMetrics.description);
  assert.ok(contract.types.StitchOptions.fields.quality);
  assert.ok(contract.types.MatchMetrics.fields.medianReprojectionErrorPx);
});
