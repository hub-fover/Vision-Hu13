import { makeError } from './errors.js';

export const INTRINSICS_SCHEMA = 'lab005.camera-intrinsics.v1';
export const SCALE_SCHEMA = 'lab005.focus-depth-scale.v1';

export function validatePattern(pattern) { if (!pattern || pattern.cols < 3 || pattern.rows < 3 || pattern.squareSize <= 0) throw makeError('CALIBRATION_FAILED'); return pattern; }

export function validateCalibration(value, dimensions = null) {
  if (!value || value.schema !== INTRINSICS_SCHEMA || !value.intrinsics) throw makeError('INTRINSICS_MISMATCH');
  const source = value.intrinsics; const matrix = source.matrix || [[source.fx, 0, source.cx], [0, source.fy, source.cy], [0, 0, 1]]; const imageSize = source.imageSize || (value.image ? [value.image.width, value.image.height] : null);
  if (!Array.isArray(matrix) || matrix.length !== 3 || matrix.some(row => !Array.isArray(row) || row.length !== 3) || !Array.isArray(imageSize) || imageSize.length !== 2) throw makeError('INTRINSICS_MISMATCH');
  const normalized = { schema: INTRINSICS_SCHEMA, intrinsics: { matrix: matrix.map(row => row.map(Number)), distortion: (source.distortion || []).map(Number), imageSize: imageSize.map(Number) }, rmsErrorPx: Number(value.rmsErrorPx ?? value.reprojectionRmsPx ?? 0), lensId: value.lensId ?? null, orientation: Number(value.orientation ?? 1), zoom: value.zoom ?? null };
  if (dimensions && (normalized.intrinsics.imageSize[0] !== dimensions.width || normalized.intrinsics.imageSize[1] !== dimensions.height)) throw makeError('INTRINSICS_MISMATCH'); return normalized;
}

export function validateScale(value) {
  if (!value || value.schema !== SCALE_SCHEMA) throw makeError('DEPTH_SCALE_UNCALIBRATED');
  const focusIndices = value.focusIndices || value.samples?.map(item => item.focus); const distancesM = value.distancesM || value.samples?.map(item => item.distance);
  if (!Array.isArray(focusIndices) || !Array.isArray(distancesM) || focusIndices.length < 2 || focusIndices.length !== distancesM.length) throw makeError('DEPTH_SCALE_UNCALIBRATED');
  const focus = focusIndices.map(Number); const distance = distancesM.map(Number); if (focus.some((item, index) => !Number.isFinite(item) || (index && item <= focus[index - 1])) || distance.some(item => !Number.isFinite(item) || item <= 0)) throw makeError('DEPTH_SCALE_UNCALIBRATED');
  return { schema: SCALE_SCHEMA, focusIndices: focus, distancesM: distance, residualM: Number(value.residualM || 0), sourceFrameCount: value.sourceFrameCount ?? null, focusCurves: value.focusCurves ?? null, quality: 'reference-only' };
}

export function fitScale(samples, distances) {
  if (!Array.isArray(samples) || samples.length < 3 || distances.length !== samples.length) throw makeError('CALIBRATION_FAILED');
  const points = samples.map((focus, index) => ({ focus: Number(focus), distance: Number(distances[index]) })).sort((a, b) => a.focus - b.focus);
  if (points.some((point, index) => !Number.isFinite(point.focus) || !Number.isFinite(point.distance) || point.distance <= 0 || (index && point.focus <= points[index - 1].focus))) throw makeError('CALIBRATION_FAILED');
  const direction = Math.sign(points.at(-1).distance - points[0].distance); if (!direction || points.some((point, index) => index && Math.sign(point.distance - points[index - 1].distance) !== direction)) throw makeError('CALIBRATION_FAILED');
  return { schema: SCALE_SCHEMA, focusIndices: points.map(point => point.focus), distancesM: points.map(point => point.distance), residualM: 0, quality: 'reference-only' };
}

export function mapDepthToMeters(value, calibration) {
  const normalized = validateScale(calibration); const focus = normalized.focusIndices; const distance = normalized.distancesM;
  if (value <= focus[0]) return distance[0]; if (value >= focus.at(-1)) return distance.at(-1);
  for (let index = 1; index < focus.length; index++) if (value <= focus[index]) { const fraction = (value - focus[index - 1]) / Math.max(1e-9, focus[index] - focus[index - 1]); return distance[index - 1] + fraction * (distance[index] - distance[index - 1]); }
  return distance.at(-1);
}
