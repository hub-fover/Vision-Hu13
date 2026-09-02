export const DEFAULTS = Object.freeze({
  analysisMaxSide: 1280,
  maxFeatures: 2500,
  ratioThreshold: 0.75,
  ransacThresholdPx: 3,
  minInliers: 20,
  minInlierRatio: 0.25,
  maxMedianErrorPx: 2.5,
  exposureGain: Object.freeze({ min: 0.7, max: 1.3 }),
  blendWidthPx: 96,
  outputMegapixels: Object.freeze({ mobile: 12, hd: 24 }),
  maxWorkingSetMiB: 384,
  warningThresholds: Object.freeze({ imageCount: 6, sourceMegapixels: 60 }),
  jpegQuality: 0.92,
});

export const ERROR_CODES = Object.freeze([
  "NOT_ENOUGH_IMAGES",
  "UNSUPPORTED_FORMAT",
  "DECODE_FAILED",
  "LOW_TEXTURE",
  "INSUFFICIENT_OVERLAP",
  "AMBIGUOUS_MATCHES",
  "HOMOGRAPHY_UNSTABLE",
  "HIGH_REPROJECTION_ERROR",
  "OUTPUT_TOO_LARGE",
  "CANCELLED",
]);

export function stitchOptions(overrides = {}) {
  return {
    ...DEFAULTS,
    ...overrides,
    exposureGain: { ...DEFAULTS.exposureGain, ...overrides.exposureGain },
    outputMegapixels: {
      ...DEFAULTS.outputMegapixels,
      ...overrides.outputMegapixels,
    },
    warningThresholds: {
      ...DEFAULTS.warningThresholds,
      ...overrides.warningThresholds,
    },
  };
}
