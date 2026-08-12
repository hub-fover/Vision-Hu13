import { estimateDepth, fitPeak, renderDepth } from './depth.js';
import { alignFrames } from './alignment.js';
import { frameMetric, grayscale } from './focus-metrics.js';
import { canUseMetricDepth, detectChessboardCorners, fitScale, mapDepthToMeters, validateCalibration, validatePattern } from './calibration.js';

let cancelled = false;
let cvRuntimePromise = null;
const postError = (id, error) => self.postMessage({ id, error: { code: error.code || 'RUNTIME_MISSING', message: error.message || String(error), detail: error.detail || '', stack: error.stack || '' } });
async function loadOpenCv(runtimeUrl = '../vendor/opencv.js', { calibration = false } = {}) {
  const supportsCalibration = runtime => Boolean(runtime && typeof runtime.calibrateCameraExtended === 'function' && typeof runtime.threshold === 'function' && typeof runtime.connectedComponentsWithStats === 'function' && typeof runtime.matFromArray === 'function');
  if (typeof self.loadLab005OpenCv === 'function') { const runtime = await self.loadLab005OpenCv(runtimeUrl); if (calibration && !supportsCalibration(runtime)) throw Object.assign(new Error('OpenCV.js calibration primitives missing'), { code: 'RUNTIME_MISSING' }); if (!calibration && typeof runtime.undistort !== 'function') throw Object.assign(new Error('OpenCV.js undistort API missing'), { code: 'RUNTIME_MISSING' }); return runtime; }
  if (self.cv?.Mat && ((!calibration && self.cv.undistort) || (calibration && supportsCalibration(self.cv)))) return self.cv;
  if (!cvRuntimePromise) cvRuntimePromise = new Promise((resolve, reject) => { let poll; let settled = false; const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timeout); clearInterval(poll); callback(value); }; const ready = value => { const runtime = value || self.cv; if (runtime && typeof runtime.then === 'function') { if (!runtime.Mat) return; const stable = Object.create(runtime); Object.defineProperty(stable, 'then', { value: undefined, configurable: true }); finish(resolve, stable); return; } if (!runtime?.Mat) return; finish(resolve, runtime); }; const timeout = setTimeout(() => finish(reject, Object.assign(new Error('OpenCV.js initialization timed out'), { code: 'RUNTIME_MISSING' })), 9000); self.Module = { onRuntimeInitialized() { ready(self.cv); } }; try { importScripts(runtimeUrl); poll = setInterval(() => ready(self.cv), 25); if (self.cv?.then) self.cv.then(ready, error => finish(reject, error)); else ready(self.cv); } catch (error) { finish(reject, Object.assign(new Error('OpenCV.js runtime missing'), { code: 'RUNTIME_MISSING', detail: error.message })); } });
  const runtime = await cvRuntimePromise; if (!runtime || (calibration ? !supportsCalibration(runtime) : typeof runtime.undistort !== 'function')) throw Object.assign(new Error('OpenCV.js runtime missing'), { code: 'RUNTIME_MISSING' }); return runtime;
}
async function calibrateScaleStacks(groups, distances, calibration) {
  if (!Array.isArray(groups) || groups.length !== 3 || groups.some(group => group.frames?.length !== 5)) throw Object.assign(new Error('Need three groups of five focus frames'), { code: 'CALIBRATION_FAILED' });
  const samples = []; for (const group of groups) { const metrics = []; for (const input of group.frames) { const frame = (await prepareFrames([input], calibration))[0]; metrics.push(frame.metric); } samples.push(fitPeak(metrics) / 4); }
  const result = fitScale(samples, distances); result.focusMetrics = samples; return result;
}
async function toFrame(input) {
  const bitmap = input.bitmap || input;
  const width = input.width || bitmap.width; const height = input.height || bitmap.height;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : null;
  if (!canvas) throw Object.assign(new Error('Canvas runtime unavailable'), { code: 'RUNTIME_MISSING' });
  const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0, width, height); if (input.bitmap) bitmap.close?.(); const image = ctx.getImageData(0, 0, width, height); const gray = grayscale(image.data, width, height); let sum = 0; let weightedX = 0; let weightedY = 0; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const weight = gray[y * width + x]; sum += weight; weightedX += x * weight; weightedY += y * weight; } return { width, height, gray, metric: frameMetric(gray, width, height), meanX: sum ? weightedX / sum : width / 2, meanY: sum ? weightedY / sum : height / 2 };
}
function canvasToRgbaMat(cv, canvas, width, height) {
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const image = new cv.Mat(height, width, cv.CV_8UC4);
  image.data.set(data);
  return image;
}
async function prepareFrames(inputs, calibration) {
  if (!calibration) return Promise.all(inputs.map(input => toFrame(input)));
  const cv = await loadOpenCv('../vendor/opencv.js'); const normalized = validateCalibration(calibration, { width: inputs[0].width, height: inputs[0].height }); const coefficients = normalized.intrinsics.distortion.length ? normalized.intrinsics.distortion : [0, 0, 0, 0, 0]; const camera = cv.matFromArray(3, 3, cv.CV_64F, normalized.intrinsics.matrix.flat()); const distortion = cv.matFromArray(1, coefficients.length, cv.CV_64F, coefficients); const frames = [];
  for (const input of inputs) { const bitmap = input.bitmap; const canvas = new OffscreenCanvas(input.width, input.height); canvas.getContext('2d').drawImage(bitmap, 0, 0, input.width, input.height); bitmap.close?.(); const image = canvasToRgbaMat(cv, canvas, input.width, input.height); const corrected = new cv.Mat(); cv.undistort(image, corrected, camera, distortion); const output = new OffscreenCanvas(input.width, input.height); cv.imshow(output, corrected); const frame = await toFrame({ bitmap: await createImageBitmap(output), width: input.width, height: input.height }); frames.push(frame); image.delete(); corrected.delete(); }
  camera.delete(); distortion.delete(); return frames;
}
self.onmessage = async event => {
  const { id, type, payload } = event.data; if (type === 'cancel') { cancelled = true; return; } cancelled = false;
  try {
    if (type === 'runtimeSmoke') {
      const cv = await loadOpenCv(payload?.runtimeUrl || '../vendor/opencv.js'); self.postMessage({ id, result: { Mat: typeof cv.Mat === 'function', findChessboardCorners: typeof cv.findChessboardCorners === 'function', findChessboardCornersSB: typeof cv.findChessboardCornersSB === 'function', calibrateCamera: typeof cv.calibrateCamera === 'function', calibrateCameraExtended: typeof cv.calibrateCameraExtended === 'function', checkerboardFallback: typeof cv.threshold === 'function' && typeof cv.connectedComponentsWithStats === 'function' && typeof cv.matFromArray === 'function', undistort: typeof cv.undistort === 'function' } });
    } else if (type === 'analyzeStack') {
      if (!Array.isArray(payload.frames) || payload.frames.length !== 5) throw Object.assign(new Error('Need five focus frames'), { code: 'INVALID_FRAME_COUNT' });
      const globalMetrics = []; for (const input of payload.frames) globalMetrics.push((await toFrame(input)).metric);
      const maximum = Math.max(...globalMetrics); const minimum = Math.min(...globalMetrics); const spread = maximum > 0 ? (maximum - minimum) / maximum : 0;
      self.postMessage({ id, result: { globalMetrics: Float32Array.from(globalMetrics), spread } });
    } else if (type === 'estimate') {
      const frames = []; for (let index = 0; index < payload.frames.length; index++) { if (cancelled) throw Object.assign(new Error('Cancelled'), { code: 'CANCELLED' }); frames.push((await prepareFrames([payload.frames[index]], payload.calibration))[0]); self.postMessage({ id, progress: (index + 1) / (payload.frames.length + 2) }); }
      const alignment = alignFrames(frames, payload.options?.maxAlignmentErrorPx ?? 2); const result = estimateDepth(alignment.frames, payload.options); let metricDepthM = null; if (canUseMetricDepth(payload.calibration, payload.scaleCalibration)) { metricDepthM = Float32Array.from(result.depth, value => mapDepthToMeters(value, payload.scaleCalibration)); } const depthCanvas = renderDepth(result, 'depth'); const confidenceCanvas = renderDepth(result, 'confidence'); const depth = depthCanvas.transferToImageBitmap(); const confidence = confidenceCanvas.transferToImageBitmap(); self.postMessage({ id, progress: 1, result: { width: result.width, height: result.height, tileSize: result.tileSize, cols: result.cols, rows: result.rows, depth: result.depth, metricDepthM, metricQuality: metricDepthM ? 'reference-only' : null, confidence: result.confidence, invalid: result.invalid, globalMetrics: result.globalMetrics, curves: result.curves, quality: result.quality, intrinsicsApplied: Boolean(payload.calibration), alignment, depthBitmap: depth, confidenceBitmap: confidence, middleMetric: alignment.frames[2].metric } }, [depth, confidence]);
    } else if (type === 'calibrateIntrinsics') {
      const cv = await loadOpenCv(payload.runtimeUrl || '../vendor/opencv.js', { calibration: true }); const pattern = validatePattern(payload.pattern); if (!payload.frames?.length || payload.frames.length < 3) throw Object.assign(new Error('Need three calibration views'), { code: 'CALIBRATION_FAILED' });
      const object = new cv.Mat(pattern.cols * pattern.rows, 3, cv.CV_32FC1); for (let row = 0; row < pattern.rows; row++) for (let col = 0; col < pattern.cols; col++) { const offset = (row * pattern.cols + col) * 3; object.data32F[offset] = col * pattern.squareSize; object.data32F[offset + 1] = row * pattern.squareSize; object.data32F[offset + 2] = 0; }
      const objectPoints = new cv.MatVector(); const imagePoints = new cv.MatVector(); const imageSize = new cv.Size(payload.frames[0].width, payload.frames[0].height); let accepted = 0;
      for (const frame of payload.frames) { const canvas = new OffscreenCanvas(frame.width, frame.height); canvas.getContext('2d').drawImage(frame.bitmap, 0, 0, frame.width, frame.height); frame.bitmap.close?.(); const image = canvasToRgbaMat(cv, canvas, frame.width, frame.height); const gray = new cv.Mat(); cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY); const corners = detectChessboardCorners(cv, gray, pattern); if (corners) { if (typeof cv.cornerSubPix === 'function' && typeof cv.TermCriteria === 'function') cv.cornerSubPix(gray, corners, new cv.Size(11, 11), new cv.Size(-1, -1), new cv.TermCriteria(cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER, 30, 0.001)); objectPoints.push_back(object); imagePoints.push_back(corners); accepted++; corners.delete?.(); } image.delete(); gray.delete(); }
      if (accepted < 3) { object.delete(); objectPoints.delete(); imagePoints.delete(); throw Object.assign(new Error('Chessboard was not detected in enough views'), { code: 'CALIBRATION_FAILED' }); }
      const cameraMatrix = cv.Mat.eye(3, 3, cv.CV_64F); const distCoeffs = new cv.Mat(); const rvecs = new cv.MatVector(); const tvecs = new cv.MatVector(); const stdIntrinsics = new cv.Mat(); const stdExtrinsics = new cv.Mat(); const perViewErrors = new cv.Mat(); const rms = cv.calibrateCameraExtended(objectPoints, imagePoints, imageSize, cameraMatrix, distCoeffs, rvecs, tvecs, stdIntrinsics, stdExtrinsics, perViewErrors, 0); const data = cameraMatrix.data64F || cameraMatrix.data32F; const distortion = Array.from(distCoeffs.data64F || distCoeffs.data32F || []).slice(0, 5); const result = { schema: 'lab005.camera-intrinsics.v1', intrinsics: { matrix: [[data[0], data[1], data[2]], [data[3], data[4], data[5]], [data[6], data[7], data[8]]], distortion, imageSize: [imageSize.width, imageSize.height] }, rmsErrorPx: rms, lensId: null, orientation: 1, zoom: null, viewsAccepted: accepted, coverage: accepted / payload.frames.length, tiltSpanDeg: null, quality: rms <= 1 ? 'stable' : 'reference-only' }; [object, objectPoints, imagePoints, cameraMatrix, distCoeffs, rvecs, tvecs, stdIntrinsics, stdExtrinsics, perViewErrors].forEach(value => value.delete?.()); self.postMessage({ id, result });
    } else if (type === 'calibrateScale') {
      const calibration = validateCalibration(payload.calibration); const result = await calibrateScaleStacks(payload.groups, payload.distances, calibration); Object.assign(result, { intrinsicsSchema: calibration.schema, imageSize: calibration.intrinsics.imageSize, lensId: calibration.lensId, orientation: calibration.orientation, zoom: calibration.zoom, sourceFrameCount: 15, quality: 'reference-only' }); self.postMessage({ id, result });
    } else throw Object.assign(new Error('Unknown worker operation'), { code: 'RUNTIME_MISSING' });
  } catch (error) { postError(id, error); }
};
