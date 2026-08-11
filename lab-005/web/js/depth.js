import { tileMetric, textureScore } from './focus-metrics.js';
import { makeError } from './errors.js';

export function fitPeak(values) {
  let best = 0; for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  if (best === 0 || best === values.length - 1) return best;
  const a = values[best - 1]; const b = values[best]; const c = values[best + 1]; const denominator = a - 2 * b + c;
  if (Math.abs(denominator) < 1e-8) return best; return best + 0.5 * (a - c) / denominator;
}

export function estimateDepth(frames, options = {}) {
  if (!Array.isArray(frames) || frames.length !== 5) throw makeError('INVALID_FRAME_COUNT');
  const width = frames[0].width; const height = frames[0].height; const tileSize = options.tileSize || 8;
  const cols = Math.ceil(width / tileSize); const rows = Math.ceil(height / tileSize); const values = new Float32Array(cols * rows); const confidence = new Float32Array(cols * rows); const invalid = new Uint8Array(cols * rows);
  const curves = frames.map(frame => tileMetric(frame.gray, width, height, tileSize).values); const global = curves.map(curve => curve.reduce((sum, value) => sum + value, 0) / curve.length);
  const maxGlobal = Math.max(...global); const minGlobal = Math.min(...global);
  if (!Number.isFinite(maxGlobal) || maxGlobal < (options.minTexture ?? 0.02) * 0.02) throw makeError('LOW_TEXTURE');
  if (maxGlobal - minGlobal < Math.max(1e-5, maxGlobal * 0.02)) throw makeError('FOCUS_SPREAD_TOO_SMALL');
  for (let index = 0; index < values.length; index++) {
    const curve = curves.map(metrics => metrics[index]); const peak = fitPeak(curve); const sorted = [...curve].sort((a, b) => b - a); const prominence = sorted[0] ? (sorted[0] - sorted[1]) / sorted[0] : 0;
    const texture = Math.min(1, Math.sqrt(sorted[0] || 0) * 4); values[index] = peak / (frames.length - 1); confidence[index] = Math.max(0, Math.min(1, prominence * 2 + texture * 0.5)); if (texture < (options.minTexture ?? 0.02) || prominence < (options.minPeakProminence ?? 0.08)) { invalid[index] = 1; confidence[index] *= 0.35; }
  }
  return { width, height, tileSize, cols, rows, depth: values, confidence, invalid, globalMetrics: global, curves, quality: confidence.reduce((a, b) => a + b, 0) / confidence.length };
}

export function renderDepth(result, kind = 'depth') {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(result.width, result.height) : document.createElement('canvas'); canvas.width = result.width; canvas.height = result.height; const ctx = canvas.getContext('2d'); const image = ctx.createImageData(result.width, result.height);
  for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++) { const tile = Math.min(result.rows - 1, Math.floor(y / result.tileSize)) * result.cols + Math.min(result.cols - 1, Math.floor(x / result.tileSize)); const value = result.depth[tile]; const conf = result.confidence[tile]; let r, g, b; if (kind === 'confidence') { r = result.invalid[tile] ? 145 : Math.round(255 * (1 - conf)); g = Math.round(220 * conf); b = result.invalid[tile] ? 145 : 80; } else { const hue = (1 - value) * 240; const h = hue / 60; const c = 0.85; const x2 = c * (1 - Math.abs(h % 2 - 1)); [r, g, b] = h < 1 ? [c, x2, 0] : h < 2 ? [x2, c, 0] : h < 3 ? [0, c, x2] : h < 4 ? [0, x2, c] : h < 5 ? [x2, 0, c] : [c, 0, x2]; r *= 255; g *= 255; b *= 255; } const p = (y * result.width + x) * 4; image.data[p] = r; image.data[p + 1] = g; image.data[p + 2] = b; image.data[p + 3] = 255; }
  ctx.putImageData(image, 0, 0); return canvas;
}
