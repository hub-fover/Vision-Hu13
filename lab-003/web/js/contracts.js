export const DEFAULTS = Object.freeze({
  inputCount: 3,
  analysisMaxSide: 1280,
  maxInputMegapixels: 48,
  maxOutputPixels: 4_000_000,
  maxWorkingSetMiB: 320,
  orbFeatures: 2000,
  ratioThreshold: 0.75,
  minInliers: 30,
  minInlierRatio: 0.30,
  maxMedianReprojectionErrorPx: 2.0,
  pyramidLevels: 5,
  weights: Object.freeze({ contrast: 1, saturation: 1, wellExposedness: 1 }),
  wellExposedSigma: 0.2,
  motionProtection: true,
  jpegQuality: 0.92,
});

export const ERROR_CODES = Object.freeze([
  "INVALID_IMAGE_COUNT", "UNSUPPORTED_FORMAT", "DECODE_FAILED",
  "EXPOSURE_SPREAD_TOO_SMALL", "SCENE_MISMATCH", "LOW_TEXTURE",
  "ALIGNMENT_FAILED", "EXCESSIVE_CROP", "OUTPUT_TOO_LARGE",
  "CANCELLED",
]);

export function fusionOptions(overrides = {}) {
  return {
    ...DEFAULTS,
    ...overrides,
    weights: { ...DEFAULTS.weights, ...overrides.weights },
  };
}
