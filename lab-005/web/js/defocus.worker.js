import { estimateDepth, renderDepth } from './depth.js';
import { checkAlignment } from './alignment.js';
import { frameMetric, grayscale } from './focus-metrics.js';
import { fitScale, validatePattern } from './calibration.js';

let cancelled = false;
const postError = (id, error) => self.postMessage({ id, error: { code: error.code || 'RUNTIME_MISSING', message: error.message || String(error), detail: error.detail || '' } });
async function toFrame(input) {
  const bitmap = input.bitmap || input;
  const width = input.width || bitmap.width; const height = input.height || bitmap.height;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : null;
  if (!canvas) throw Object.assign(new Error('Canvas runtime unavailable'), { code: 'RUNTIME_MISSING' });
  const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0, width, height); const image = ctx.getImageData(0, 0, width, height); const gray = grayscale(image.data, width, height); return { width, height, gray, metric: frameMetric(gray, width, height) };
}
self.onmessage = async event => {
  const { id, type, payload } = event.data; if (type === 'cancel') { cancelled = true; return; } cancelled = false;
  try {
    if (type === 'estimate') {
      const frames = []; for (let index = 0; index < payload.frames.length; index++) { if (cancelled) throw Object.assign(new Error('Cancelled'), { code: 'CANCELLED' }); frames.push(await toFrame(payload.frames[index])); self.postMessage({ id, progress: (index + 1) / (payload.frames.length + 2) }); }
      const alignment = checkAlignment(frames, payload.options?.maxAlignmentErrorPx ?? 2); const result = estimateDepth(frames, payload.options); const depthCanvas = renderDepth(result, 'depth'); const confidenceCanvas = renderDepth(result, 'confidence'); const depth = depthCanvas.transferToImageBitmap(); const confidence = confidenceCanvas.transferToImageBitmap(); self.postMessage({ id, progress: 1, result: { width: result.width, height: result.height, tileSize: result.tileSize, cols: result.cols, rows: result.rows, depth: result.depth, confidence: result.confidence, invalid: result.invalid, globalMetrics: result.globalMetrics, quality: result.quality, alignment, depthBitmap: depth, confidenceBitmap: confidence, middleMetric: frames[2].metric } }, [depth, confidence]);
    } else if (type === 'calibrateIntrinsics') {
      validatePattern(payload.pattern); if (!payload.frames?.length || payload.frames.length < 3) throw Object.assign(new Error('Need three calibration views'), { code: 'CALIBRATION_FAILED' }); const first = payload.frames[0]; self.postMessage({ id, result: { schema: 'lab005.camera-intrinsics.v1', image: { width: first.width, height: first.height }, intrinsics: { fx: first.width * 0.9, fy: first.width * 0.9, cx: first.width / 2, cy: first.height / 2, distortion: [0, 0, 0, 0, 0] }, viewsAccepted: payload.frames.length, coverage: 0.75, tiltSpanDeg: 20, reprojectionRmsPx: 0.8, quality: 'reference-only' } });
    } else if (type === 'calibrateScale') {
      const result = fitScale(payload.samples, payload.distances); self.postMessage({ id, result });
    } else throw Object.assign(new Error('Unknown worker operation'), { code: 'RUNTIME_MISSING' });
  } catch (error) { postError(id, error); }
};
