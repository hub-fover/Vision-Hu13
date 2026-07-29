import { stitchOptions } from "./contracts.js";
import { StitchError } from "./errors.js";

export const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const SOURCE_BYTES_PER_PIXEL = 4;
const EXPOSURE_TEMPORARY_BYTES = 65_536 * 2 * Float32Array.BYTES_PER_ELEMENT;

function adjacentError(error, pairIndex, pairNames) {
  if (!(error instanceof StitchError) || error.pairIndex !== null) throw error;
  return new StitchError(error.code, error.message, {
    pairIndex,
    pairNames: pairNames?.[pairIndex] ?? null,
    cause: error,
  });
}

export function multiply3(left, right) {
  const result = Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      for (let index = 0; index < 3; index += 1) {
        result[row * 3 + column] +=
          left[row * 3 + index] * right[index * 3 + column];
      }
    }
  }
  return normalizeHomography(result);
}

export function determinant3(matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  return a * (e * i - f * h) -
    b * (d * i - f * g) +
    c * (d * h - e * g);
}

export function invert3(matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = determinant3(matrix);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new StitchError(
      "HOMOGRAPHY_UNSTABLE",
      "Adjacent transform is singular.",
    );
  }
  return normalizeHomography([
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ].map((value) => value / determinant));
}

export function normalizeHomography(matrix) {
  if (!Array.isArray(matrix) && !ArrayBuffer.isView(matrix)) {
    throw new TypeError("homography must contain nine numbers");
  }
  if (matrix.length !== 9 || !matrix.every(Number.isFinite)) {
    throw new StitchError("HOMOGRAPHY_UNSTABLE", "Invalid homography values.");
  }
  const scale = matrix[8];
  if (Math.abs(scale) < 1e-12) {
    throw new StitchError("HOMOGRAPHY_UNSTABLE", "Singular normalization.");
  }
  return Array.from(matrix, (value) => {
    const normalized = value / scale;
    return Object.is(normalized, -0) ? 0 : normalized;
  });
}

export function applyHomography(matrix, point) {
  const denominator = matrix[6] * point[0] + matrix[7] * point[1] + matrix[8];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) {
    throw new StitchError(
      "HOMOGRAPHY_UNSTABLE",
      "Point projects to infinity.",
    );
  }
  return [
    (matrix[0] * point[0] + matrix[1] * point[1] + matrix[2]) / denominator,
    (matrix[3] * point[0] + matrix[4] * point[1] + matrix[5]) / denominator,
  ];
}

export function composeTransforms(adjacentHomographies, {
  imageCount = adjacentHomographies.length + 1,
  anchorIndex = Math.floor(imageCount / 2),
  pairNames = null,
} = {}) {
  if (
    imageCount < 1 ||
    adjacentHomographies.length !== imageCount - 1 ||
    anchorIndex < 0 ||
    anchorIndex >= imageCount
  ) {
    throw new RangeError("invalid image count or anchor");
  }
  const result = Array.from({ length: imageCount }, () => [...IDENTITY]);
  for (let index = anchorIndex - 1; index >= 0; index -= 1) {
    try {
      result[index] = multiply3(
        result[index + 1],
        normalizeHomography(adjacentHomographies[index]),
      );
    } catch (error) {
      throw adjacentError(error, index, pairNames);
    }
  }
  for (let index = anchorIndex + 1; index < imageCount; index += 1) {
    const pairIndex = index - 1;
    try {
      result[index] = multiply3(
        result[index - 1],
        invert3(normalizeHomography(adjacentHomographies[pairIndex])),
      );
    } catch (error) {
      throw adjacentError(error, pairIndex, pairNames);
    }
  }
  return result;
}

function transformedCorners(image, transform) {
  return [
    [0, 0],
    [image.width, 0],
    [image.width, image.height],
    [0, image.height],
  ].map((point) => applyHomography(transform, point));
}

export function planCanvas(images, transforms, {
  quality = "mobile",
  ...overrides
} = {}) {
  const options = stitchOptions(overrides);
  if (!images.length || images.length !== transforms.length) {
    throw new RangeError("images and transforms must have the same non-zero length");
  }
  if (!["mobile", "hd"].includes(quality)) {
    throw new RangeError("quality must be mobile or hd");
  }
  const pairNames = images.slice(0, -1).map((image, index) => [
    image.name,
    images[index + 1].name,
  ]);
  const points = images.flatMap((image, index) => {
    try {
      return transformedCorners(image, transforms[index]);
    } catch (error) {
      throw adjacentError(
        error,
        Math.min(index, images.length - 2),
        pairNames,
      );
    }
  });
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.floor(Math.min(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxX = Math.ceil(Math.max(...xs));
  const maxY = Math.ceil(Math.max(...ys));
  const baseWidth = Math.max(1, maxX - minX);
  const baseHeight = Math.max(1, maxY - minY);
  const pixelLimit = options.outputMegapixels[quality] * 1_000_000;
  let outputScale = Math.min(
    1,
    Math.sqrt(pixelLimit / (baseWidth * baseHeight)),
    32766 / baseWidth,
    32766 / baseHeight,
  );
  const sourceBytes = images.reduce(
    (sum, image) =>
      sum + image.width * image.height * SOURCE_BYTES_PER_PIXEL,
    0,
  );
  const analysisPeakBytes = images.reduce((largest, image) => {
    const scale = Math.min(
      1,
      options.analysisMaxSide / Math.max(image.width, image.height),
    );
    const pixels =
      Math.max(1, Math.round(image.width * scale)) *
      Math.max(1, Math.round(image.height * scale));
    return Math.max(largest, pixels * 2);
  }, 0);
  const fixedBytes = sourceBytes +
    analysisPeakBytes +
    images.length * 1024 * 1024 +
    EXPOSURE_TEMPORARY_BYTES;
  const canvasBytesPerPixel = 64 + 5 * images.length;
  const budgetBytes = options.maxWorkingSetMiB * 1024 * 1024;
  const requestedPixels =
    Math.max(1, Math.floor(baseWidth * outputScale)) *
    Math.max(1, Math.floor(baseHeight * outputScale));
  if (fixedBytes + requestedPixels * canvasBytesPerPixel > budgetBytes) {
    const availablePixels = Math.floor(
      (budgetBytes - fixedBytes) / canvasBytesPerPixel,
    );
    if (availablePixels < 256) {
      throw new StitchError(
        "OUTPUT_TOO_LARGE",
        "Source and analysis images exceed the working-set budget.",
      );
    }
    outputScale = Math.min(
      outputScale,
      Math.sqrt(availablePixels / (baseWidth * baseHeight)),
    );
  }
  const width = Math.max(1, Math.floor(baseWidth * outputScale));
  const height = Math.max(1, Math.floor(baseHeight * outputScale));
  const estimatedWorkingSetBytes =
    fixedBytes + width * height * canvasBytesPerPixel;
  if (estimatedWorkingSetBytes > budgetBytes) {
    throw new StitchError("OUTPUT_TOO_LARGE", "Working-set budget exceeded.");
  }
  const translation = [1, 0, -minX, 0, 1, -minY, 0, 0, 1];
  const scale = [outputScale, 0, 0, 0, outputScale, 0, 0, 0, 1];
  return {
    width,
    height,
    outputScale,
    sourceBytesPerPixel: SOURCE_BYTES_PER_PIXEL,
    exposureTemporaryBytes: EXPOSURE_TEMPORARY_BYTES,
    canvasBytesPerPixel,
    estimatedWorkingSetBytes,
    estimatedWorkingSetMiB: estimatedWorkingSetBytes / (1024 * 1024),
    transforms: transforms.map((transform) =>
      multiply3(scale, multiply3(translation, transform))),
  };
}
