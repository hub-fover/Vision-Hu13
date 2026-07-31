import { applySimilarity, estimateSimilarityRansac } from "../web/js/alignment.js";
import { DEFAULTS } from "../web/js/contracts.js";
import { fusePyramids } from "../web/js/pyramid.js";
import { computeQualityWeights } from "../web/js/weights.js";

const width = 64;
const height = 48;
function image(exposure) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const base = 24 + x * 2.2 + y * 1.4 + ((x >> 3) % 2) * 28 + ((y >> 3) % 2) * 19;
      const values = [base * exposure, (base * .84 + 18) * exposure, (base * .68 + 31) * exposure];
      for (let channel = 0; channel < 3; channel += 1) data[pixel * 4 + channel] = Math.max(0, Math.min(255, Math.round(values[channel])));
      data[pixel * 4 + 3] = 255;
    }
  }
  return { width, height, data };
}

const images = [image(.55), image(1), image(1.65)];
const { weights } = computeQualityWeights(images, DEFAULTS);
const fused = fusePyramids(images, weights, DEFAULTS.pyramidLevels);

const expected = [1.012, -0.018, 3.5, 0.018, 1.012, -2.25];
const source = Array.from({ length: 48 }, (_, index) => [4 + index % 8 * 7, 3 + Math.floor(index / 8) * 7]);
const target = source.map((point) => applySimilarity(expected, point));
target[5] = [300, -100];
target[23] = [-200, 400];
const alignment = estimateSimilarityRansac(source, target);
const controlPoints = [[0, 0], [63, 0], [63, 47], [0, 47], [32, 24]];
const controlPointErrors = controlPoints.map((point) => {
  const actual = applySimilarity(alignment.matrix, point);
  const wanted = applySimilarity(expected, point);
  return Math.hypot(actual[0] - wanted[0], actual[1] - wanted[1]);
});

process.stdout.write(`${JSON.stringify({
  width,
  height,
  fusionRgb: Array.from(fused.data).filter((_, index) => index % 4 !== 3),
  transform: alignment.matrix,
  maxControlPointErrorPx: Math.max(...controlPointErrors),
})}\n`);
