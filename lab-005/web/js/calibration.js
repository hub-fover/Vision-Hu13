import { makeError } from './errors.js';

export const INTRINSICS_SCHEMA = 'lab005.camera-intrinsics.v1';
export const SCALE_SCHEMA = 'lab005.focus-depth-scale.v1';

export function validatePattern(pattern) { if (!pattern || pattern.cols < 3 || pattern.rows < 3 || pattern.squareSize <= 0) throw makeError('CALIBRATION_FAILED'); return pattern; }
export function validateCalibration(value, dimensions = null) {
  if (!value || value.schema !== INTRINSICS_SCHEMA || !value.intrinsics) throw makeError('INTRINSICS_MISMATCH');
  if (dimensions && (value.image?.width !== dimensions.width || value.image?.height !== dimensions.height)) throw makeError('INTRINSICS_MISMATCH');
  return value;
}
export function validateScale(value) { if (!value || value.schema !== SCALE_SCHEMA || !Array.isArray(value.samples) || value.samples.length < 3) throw makeError('DEPTH_SCALE_UNCALIBRATED'); return value; }
export function fitScale(samples, distances) {
  if (!Array.isArray(samples) || samples.length < 3 || distances.length !== samples.length) throw makeError('CALIBRATION_FAILED');
  const points = samples.map((focus, index) => ({ focus: Number(focus), distance: Number(distances[index]) })).sort((a, b) => a.focus - b.focus); for (let i = 1; i < points.length; i++) if (points[i].distance < points[i - 1].distance) points[i].distance = points[i - 1].distance;
  return { schema: SCALE_SCHEMA, samples: points, residualM: 0, quality: 'reference-only' };
}
