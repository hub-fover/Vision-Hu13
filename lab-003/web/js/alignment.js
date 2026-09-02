import { FusionError } from "./errors.js";

function median(values) {
  if (!values.length) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function applySimilarity(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2],
    matrix[3] * point[0] + matrix[4] * point[1] + matrix[5],
  ];
}

export function fitSimilarity(source, target) {
  if (source.length !== target.length || source.length < 2) return null;
  let sourceX = 0;
  let sourceY = 0;
  let targetX = 0;
  let targetY = 0;
  for (let index = 0; index < source.length; index += 1) {
    sourceX += source[index][0];
    sourceY += source[index][1];
    targetX += target[index][0];
    targetY += target[index][1];
  }
  sourceX /= source.length;
  sourceY /= source.length;
  targetX /= target.length;
  targetY /= target.length;
  let denominator = 0;
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < source.length; index += 1) {
    const sx = source[index][0] - sourceX;
    const sy = source[index][1] - sourceY;
    const tx = target[index][0] - targetX;
    const ty = target[index][1] - targetY;
    denominator += sx * sx + sy * sy;
    real += sx * tx + sy * ty;
    imaginary += sx * ty - sy * tx;
  }
  if (denominator < 1e-8) return null;
  const a = real / denominator;
  const b = imaginary / denominator;
  return [a, -b, targetX - a * sourceX + b * sourceY,
    b, a, targetY - b * sourceX - a * sourceY];
}

function errorsFor(matrix, source, target) {
  return source.map((point, index) => {
    const projected = applySimilarity(matrix, point);
    return Math.hypot(projected[0] - target[index][0], projected[1] - target[index][1]);
  });
}

export function estimateSimilarityRansac(source, target, options = {}) {
  const threshold = options.ransacThresholdPx ?? 3;
  if (source.length !== target.length || source.length < 2) {
    throw new FusionError("ALIGNMENT_FAILED", "Not enough mutual matches survived.");
  }
  let best = null;
  let examined = 0;
  const maxHypotheses = options.maxHypotheses ?? 768;
  for (let first = 0; first < source.length - 1 && examined < maxHypotheses; first += 1) {
    for (let second = first + 1; second < source.length && examined < maxHypotheses; second += 1) {
      examined += 1;
      const matrix = fitSimilarity([source[first], source[second]], [target[first], target[second]]);
      if (!matrix) continue;
      const errors = errorsFor(matrix, source, target);
      const inliers = errors.map((error, index) => error <= threshold ? index : -1).filter((index) => index >= 0);
      const score = [inliers.length, -median(inliers.map((index) => errors[index]))];
      if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) {
        best = { inliers, score };
      }
    }
  }
  if (!best) throw new FusionError("ALIGNMENT_FAILED", "No stable transform was found.");
  const matrix = fitSimilarity(
    best.inliers.map((index) => source[index]),
    best.inliers.map((index) => target[index]),
  );
  const errors = errorsFor(matrix, source, target);
  const inlierErrors = best.inliers.map((index) => errors[index]);
  return {
    matrix,
    inliers: best.inliers,
    metrics: {
      matchCount: source.length,
      inlierCount: best.inliers.length,
      inlierRatio: best.inliers.length / source.length,
      medianReprojectionErrorPx: median(inlierErrors),
    },
  };
}

export function validateAlignment(result, width, height, options) {
  const { matrix, metrics } = result;
  const scale = Math.hypot(matrix[0], matrix[3]);
  const rotationDegrees = Math.atan2(matrix[3], matrix[0]) * 180 / Math.PI;
  const translationFraction = Math.hypot(matrix[2], matrix[5]) / Math.max(width, height);
  if (metrics.inlierCount < options.minInliers
      || metrics.inlierRatio < options.minInlierRatio
      || metrics.medianReprojectionErrorPx > options.maxMedianReprojectionErrorPx
      || scale < 0.95 || scale > 1.05
      || Math.abs(rotationDegrees) > 5 || translationFraction > 0.10) {
    throw new FusionError("ALIGNMENT_FAILED", "The camera moved too far between exposures.");
  }
  return { ...result, metrics: { ...metrics, scale, rotationDegrees, translationFraction } };
}
