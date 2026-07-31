import { analyzeExposures } from "./analysis.js";
import { cropCommonRegion, cropImage } from "./crop.js";
import { fusionOptions } from "./contracts.js";
import { FusionError } from "./errors.js";
import { detectMotion, protectMotion } from "./motion.js";
import { fusePyramids } from "./pyramid.js";
import { computeQualityWeights } from "./weights.js";

export function estimateWorkingSetMiB(width, height) {
  return width * height * 72 / (1024 * 1024);
}

function checkCancelled(isCancelled) {
  if (isCancelled?.()) throw new FusionError("CANCELLED", "Exposure fusion was cancelled.");
}

function identityMask(width, height) {
  const mask = new Uint8Array(width * height);
  mask.fill(255);
  return mask;
}

function motionOverlay(image, mask) {
  const data = new Uint8ClampedArray(image.data);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const offset = pixel * 4;
    data[offset] = Math.round(data[offset] * 0.45 + 255 * 0.55);
    data[offset + 1] = Math.round(data[offset + 1] * 0.45 + 67 * 0.55);
    data[offset + 2] = Math.round(data[offset + 2] * 0.45 + 54 * 0.55);
  }
  return { ...image, data };
}

export async function encodeImage(image, type = "image/jpeg", quality = 0.92) {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d", { alpha: false });
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas.convertToBlob({ type, quality });
}

export async function fuseExposureImages(images, {
  adapter,
  options: overrides,
  onProgress = () => {},
  isCancelled = () => false,
} = {}) {
  const options = fusionOptions(overrides);
  if (images.length !== options.inputCount) throw new FusionError("INVALID_IMAGE_COUNT", "Choose exactly three exposures.");
  const exposure = analyzeExposures(images);
  const ordered = exposure.orderedIndices.map((index) => images[index]);
  const reference = ordered[1];
  if (estimateWorkingSetMiB(reference.width, reference.height) > options.maxWorkingSetMiB) {
    throw new FusionError("OUTPUT_TOO_LARGE", "The estimated working set exceeds the mobile budget.");
  }
  onProgress({ stage: "检查三张照片", progress: 0.18 });
  checkCancelled(isCancelled);
  const aligned = [];
  const masks = [];
  const transforms = [];
  const alignments = [];
  for (let index = 0; index < ordered.length; index += 1) {
    if (index === 1) {
      aligned.push(reference);
      masks.push(identityMask(reference.width, reference.height));
      transforms.push([1, 0, 0, 0, 1, 0]);
      continue;
    }
    const result = adapter.alignPair(ordered[index], reference, options);
    const warped = adapter.warp(ordered[index], result.matrix, reference.width, reference.height);
    aligned.push(warped.image);
    masks.push(warped.mask);
    transforms.push(result.matrix);
    alignments.push({ sourceIndex: index, referenceIndex: 1, ...result.metrics });
  }
  onProgress({ stage: "对齐轻微手抖", progress: 0.43 });
  checkCancelled(isCancelled);
  const crop = cropCommonRegion(masks, reference.width, reference.height);
  const cropped = aligned.map((image) => cropImage(image, crop));
  const { weights, components } = computeQualityWeights(cropped, options);
  onProgress({ stage: "计算融合权重", progress: 0.62 });
  checkCancelled(isCancelled);
  const motionMask = detectMotion(cropped);
  let motionMetrics = {
    detectedFraction: motionMask.reduce((sum, value) => sum + (value ? 1 : 0), 0) / motionMask.length,
    protectedFraction: 0,
  };
  if (options.motionProtection) {
    const protectedResult = protectMotion(weights, motionMask);
    motionMetrics = protectedResult.metrics;
  }
  const fused = fusePyramids(cropped, weights, options.pyramidLevels);
  onProgress({ stage: "多尺度融合", progress: 0.86 });
  checkCancelled(isCancelled);
  const [jpeg, middle, motion] = await Promise.all([
    encodeImage(fused, "image/jpeg", options.jpegQuality),
    encodeImage(cropped[1], "image/jpeg", options.jpegQuality),
    encodeImage(motionOverlay(cropped[1], motionMask), "image/png"),
  ]);
  onProgress({ stage: "完成", progress: 1 });
  return {
    jpeg,
    middle,
    motion,
    width: fused.width,
    height: fused.height,
    report: {
      exposure,
      alignments,
      motion: motionMetrics,
      crop,
      transforms,
      estimatedWorkingSetMiB: estimateWorkingSetMiB(fused.width, fused.height),
      componentSummary: components.map((component) => ({
        contrastMean: component.contrast.reduce((sum, value) => sum + value, 0) / component.contrast.length,
        saturationMean: component.saturation.reduce((sum, value) => sum + value, 0) / component.saturation.length,
        wellExposednessMean: component.wellExposedness.reduce((sum, value) => sum + value, 0) / component.wellExposedness.length,
      })),
    },
  };
}
