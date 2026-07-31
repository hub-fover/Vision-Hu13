import { FusionError } from "./errors.js";

export const MIN_RELATIVE_EXPOSURE_SPREAD = 0.75;

function linearize(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function luminanceScore(image) {
  const { data } = image;
  let logSum = 0;
  let count = 0;
  const stride = Math.max(4, Math.floor(data.length / 262144 / 4) * 4);
  for (let offset = 0; offset < data.length; offset += stride) {
    const y = Math.max(
      1e-4,
      0.2126 * linearize(data[offset])
      + 0.7152 * linearize(data[offset + 1])
      + 0.0722 * linearize(data[offset + 2]),
    );
    logSum += Math.log(y);
    count += 1;
  }
  return Math.log2(Math.exp(logSum / Math.max(1, count)));
}

function clippingFraction(image, predicate) {
  let clipped = 0;
  let count = 0;
  const stride = Math.max(4, Math.floor(image.data.length / 262144 / 4) * 4);
  for (let offset = 0; offset < image.data.length; offset += stride) {
    for (let channel = 0; channel < 3; channel += 1) {
      clipped += predicate(image.data[offset + channel]) ? 1 : 0;
      count += 1;
    }
  }
  return clipped / Math.max(1, count);
}

export function analyzeExposures(images) {
  if (images.length !== 3) throw new FusionError("INVALID_IMAGE_COUNT", "Choose exactly three exposures.");
  const luminanceScores = images.map(luminanceScore);
  const orderedIndices = [0, 1, 2].sort((left, right) => luminanceScores[left] - luminanceScores[right]);
  const relativeSpread = luminanceScores[orderedIndices[2]] - luminanceScores[orderedIndices[0]];
  if (relativeSpread < MIN_RELATIVE_EXPOSURE_SPREAD) {
    throw new FusionError("EXPOSURE_SPREAD_TOO_SMALL", "The three photos are too similar.");
  }
  return {
    orderedIndices,
    luminanceScores,
    relativeSpread,
    shadowClipping: images.map((image) => clippingFraction(image, (value) => value <= 5)),
    highlightClipping: images.map((image) => clippingFraction(image, (value) => value >= 250)),
  };
}
