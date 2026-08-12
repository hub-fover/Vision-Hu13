import { tileMetric, textureScore } from './focus-metrics.js';
import { makeError } from './errors.js';

export function fitPeak(values) {
  let best = 0; for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  if (best === 0 || best === values.length - 1) return best;
  const a = values[best - 1]; const b = values[best]; const c = values[best + 1]; const denominator = a - 2 * b + c;
  if (Math.abs(denominator) < 1e-8) return best; const offset = 0.5 * (a - c) / denominator; return Math.abs(offset) <= 1 ? best + offset : best;
}

function median(values) { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }

function peakAndProminence(values) {
  let best = 0; for (let index = 1; index < values.length; index++) if (values[index] > values[best]) best = index;
  const peak = Number(values[best]); const baseline = median(values.filter((_, index) => index !== best));
  return { index: fitPeak(values), prominence: Math.max(0, (peak - baseline) / Math.max(Math.abs(peak), 1e-8)) };
}

export function edgeAwareSmooth(depth, confidence, invalid, rows, cols, edgeThreshold = 0.15) {
  const output = Float32Array.from(depth);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const center = y * cols + x; if (invalid[center]) continue;
    let weightedSum = 0; let weightSum = 0;
    for (const [ny, nx] of [[y, x], [y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]]) {
      if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
      const index = ny * cols + nx; if (invalid[index] || Math.abs(depth[index] - depth[center]) > edgeThreshold) continue;
      const weight = Math.max(confidence[index], 1e-6); weightedSum += depth[index] * weight; weightSum += weight;
    }
    if (weightSum) output[center] = weightedSum / weightSum;
  }
  return output;
}

export function estimateDepthFromScores(curves, rows, cols, options = {}) {
  if (!Array.isArray(curves) || curves.length !== 5) throw makeError('INVALID_FRAME_COUNT');
  const length = rows * cols; if (curves.some(curve => curve.length !== length)) throw new RangeError('focus score shape mismatch');
  const minTexture = options.minTexture ?? 0.02; const minPeakProminence = options.minPeakProminence ?? 0.08; const referenceConfidence = options.referenceConfidence ?? 0.45;
  const rawDepth = new Float32Array(length); const confidence = new Float32Array(length); const invalid = new Uint8Array(length); const peakIndex = new Float32Array(length);
  const tileMeans = new Float32Array(length); for (let index = 0; index < length; index++) tileMeans[index] = curves.reduce((sum, curve) => sum + curve[index], 0) / curves.length;
  const textureScale = Math.max(...tileMeans, 1e-8); const texture = options.texture ? Float32Array.from(options.texture) : Float32Array.from(tileMeans, value => value / textureScale);
  if (texture.length !== length) throw new RangeError('texture shape mismatch');
  for (let index = 0; index < length; index++) {
    const curve = curves.map(values => Number(values[index])); const peak = peakAndProminence(curve); const normalized = Math.max(0, Math.min(1, peak.index / 4)); const localConfidence = Math.max(0, Math.min(1, peak.prominence * Math.min(texture[index] / 0.15, 1)));
    rawDepth[index] = normalized; peakIndex[index] = peak.index; confidence[index] = localConfidence;
    invalid[index] = texture[index] < minTexture || peak.prominence < minPeakProminence || localConfidence < referenceConfidence ? 1 : 0;
  }
  if (invalid.every(Boolean) && Math.max(...texture, 0) < minTexture) throw makeError('LOW_TEXTURE');
  if (Math.max(...confidence, 0) < minPeakProminence) throw makeError('LOW_PEAK_PROMINENCE');
  const depth = edgeAwareSmooth(rawDepth, confidence, invalid, rows, cols, options.edgeThreshold ?? 0.15);
  return { depth, confidence, invalid, peakIndex, texture };
}

export function estimateDepth(frames, options = {}) {
  if (!Array.isArray(frames) || frames.length !== 5) throw makeError('INVALID_FRAME_COUNT');
  const width = frames[0].width; const height = frames[0].height; const tileSize = options.tileSize || 8;
  const cols = Math.ceil(width / tileSize); const rows = Math.ceil(height / tileSize);
  const curves = frames.map(frame => tileMetric(frame.gray, width, height, tileSize).values); const global = curves.map(curve => curve.reduce((sum, value) => sum + value, 0) / curve.length);
  const maxGlobal = Math.max(...global); const minGlobal = Math.min(...global);
  if (!Number.isFinite(maxGlobal) || maxGlobal < (options.minTexture ?? 0.02) * 0.02) throw makeError('LOW_TEXTURE');
  if (maxGlobal - minGlobal < Math.max(1e-5, maxGlobal * 0.02)) throw makeError('FOCUS_SPREAD_TOO_SMALL');
  const result = estimateDepthFromScores(curves, rows, cols, options);
  return { width, height, tileSize, cols, rows, ...result, globalMetrics: global, curves, quality: result.confidence.reduce((a, b) => a + b, 0) / result.confidence.length };
}

export function renderDepth(result, kind = 'depth') {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(result.width, result.height) : document.createElement('canvas'); canvas.width = result.width; canvas.height = result.height; const ctx = canvas.getContext('2d'); const image = ctx.createImageData(result.width, result.height);
  for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++) { const tile = Math.min(result.rows - 1, Math.floor(y / result.tileSize)) * result.cols + Math.min(result.cols - 1, Math.floor(x / result.tileSize)); const value = result.depth[tile]; const conf = result.confidence[tile]; let r, g, b; if (kind === 'confidence') { r = result.invalid[tile] ? 145 : Math.round(255 * (1 - conf)); g = Math.round(220 * conf); b = result.invalid[tile] ? 145 : 80; } else { const hue = (1 - value) * 240; const h = hue / 60; const c = 0.85; const x2 = c * (1 - Math.abs(h % 2 - 1)); [r, g, b] = h < 1 ? [c, x2, 0] : h < 2 ? [x2, c, 0] : h < 3 ? [0, c, x2] : h < 4 ? [0, x2, c] : h < 5 ? [x2, 0, c] : [c, 0, x2]; r *= 255; g *= 255; b *= 255; } const p = (y * result.width + x) * 4; image.data[p] = r; image.data[p + 1] = g; image.data[p + 2] = b; image.data[p + 3] = 255; }
  ctx.putImageData(image, 0, 0); return canvas;
}
