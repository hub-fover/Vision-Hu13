import { makeError } from './errors.js';

export const INTRINSICS_SCHEMA = 'lab005.camera-intrinsics.v1';
export const SCALE_SCHEMA = 'lab005.focus-depth-scale.v1';

/**
 * Detect the internal corners of a printed chessboard.  The pinned browser
 * runtime omits OpenCV's high-level chessboard detector, so use its real
 * imgproc primitives to recover the alternating dark-cell lattice.  This is
 * deliberately conservative: an ambiguous/partial board returns null and
 * the caller reports CALIBRATION_FAILED instead of inventing points.
 */
export function detectChessboardCorners(cv, gray, pattern) {
  const direct = cv.findChessboardCornersSB || cv.findChessboardCorners;
  if (typeof direct === 'function') {
    const corners = new cv.Mat();
    const found = direct(gray, new cv.Size(pattern.cols, pattern.rows), corners);
    if (found && corners.rows >= pattern.cols * pattern.rows) return corners;
    corners.delete?.();
  }
  if (typeof cv.connectedComponentsWithStats !== 'function' || typeof cv.threshold !== 'function') return null;

  const cellsX = pattern.cols + 1;
  const cellsY = pattern.rows + 1;
  const expectedPerRow = Math.floor(cellsX / 2);
  const imageArea = gray.rows * gray.cols;
  const candidatesByPolarity = [];
  for (const polarity of [cv.THRESH_BINARY_INV, cv.THRESH_BINARY]) {
    const binary = new cv.Mat();
    const labels = new cv.Mat();
    const stats = new cv.Mat();
    const centroids = new cv.Mat();
    try {
      cv.threshold(gray, binary, 0, 255, polarity | (cv.THRESH_OTSU || 8));
      const count = cv.connectedComponentsWithStats(binary, labels, stats, centroids, 4, cv.CV_32S);
      const components = [];
      for (let index = 1; index < count; index++) {
        const area = stats.intAt(index, cv.CC_STAT_AREA);
        const width = stats.intAt(index, cv.CC_STAT_WIDTH);
        const height = stats.intAt(index, cv.CC_STAT_HEIGHT);
        if (area < imageArea * 0.00003 || width < 4 || height < 4) continue;
        const aspect = width / Math.max(1, height);
        if (aspect < 0.45 || aspect > 2.2) continue;
        components.push({ area, width, height, x: centroids.doubleAt(index, 0), y: centroids.doubleAt(index, 1) });
      }
      if (components.length >= expectedPerRow * Math.max(3, cellsY - 1)) candidatesByPolarity.push(components);
    } finally {
      binary.delete?.(); labels.delete?.(); stats.delete?.(); centroids.delete?.();
    }
  }
  let best = null;
  for (const components of candidatesByPolarity) {
    const medianArea = components.map(item => item.area).sort((a, b) => a - b)[Math.floor(components.length / 2)];
    const similar = components.filter(item => item.area >= medianArea * 0.35 && item.area <= medianArea * 2.8);
    if (similar.length < expectedPerRow * Math.max(3, cellsY - 1)) continue;
    const rows = clusterRows(similar, cellsY);
    if (!rows || rows.some(row => row.length < expectedPerRow - 1)) continue;
    const score = rows.reduce((sum, row) => sum + Math.min(row.length, expectedPerRow), 0);
    if (!best || score > best.score) best = { rows, score };
  }
  if (!best) return null;

  const rows = best.rows;
  // Infer each dark cell's integer lattice coordinate.  A board with an even
  // number of cells per row has the same count of dark cells in every row;
  // the parity alternates by row. Try both possible starting parities and
  // retain the one that yields the most complete internal-corner lattice.
  let chosen = null;
  for (const baseParity of [0, 1]) {
    const cells = new Map();
    rows.forEach((row, rowIndex) => {
      const sorted = row.slice().sort((a, b) => a.x - b.x);
      const parity = (baseParity + rowIndex) & 1;
      const start = parity === 0 ? 0 : 1;
      sorted.forEach((item, itemIndex) => {
        const col = start + itemIndex * 2;
        if (col < cellsX) cells.set(`${col},${rowIndex}`, item);
      });
    });
    const points = [];
    for (let row = 1; row <= cellsY - 1; row++) {
      for (let col = 1; col <= cellsX - 1; col++) {
        const neighbors = [[col - 1, row - 1], [col, row - 1], [col - 1, row], [col, row]]
          .map(([x, y]) => cells.get(`${x},${y}`)).filter(Boolean);
        if (neighbors.length < 2) continue;
        // The two same-colour diagonal cells straddle an internal corner.
        const x = neighbors.reduce((sum, item) => sum + item.x, 0) / neighbors.length;
        const y = neighbors.reduce((sum, item) => sum + item.y, 0) / neighbors.length;
        points.push([x, y]);
      }
    }
    if (!chosen || points.length > chosen.points.length) chosen = { points };
  }
  const needed = pattern.cols * pattern.rows;
  if (!chosen || chosen.points.length !== needed) return null;
  return cv.matFromArray(needed, 1, cv.CV_32FC2, chosen.points.flat());
}

function clusterRows(items, count) {
  if (items.length < count) return null;
  const ys = items.map(item => item.y); const min = Math.min(...ys); const max = Math.max(...ys);
  if (!(max > min)) return null;
  const centers = Array.from({ length: count }, (_, index) => min + ((index + 0.5) / count) * (max - min));
  for (let iteration = 0; iteration < 24; iteration++) {
    const groups = Array.from({ length: count }, () => []);
    for (const item of items) {
      let selected = 0; let distance = Math.abs(item.y - centers[0]);
      for (let index = 1; index < count; index++) { const candidate = Math.abs(item.y - centers[index]); if (candidate < distance) { selected = index; distance = candidate; } }
      groups[selected].push(item);
    }
    let changed = false;
    groups.forEach((group, index) => { if (!group.length) return; const next = group.reduce((sum, item) => sum + item.y, 0) / group.length; if (Math.abs(next - centers[index]) > 0.25) changed = true; centers[index] = next; });
    if (!changed) break;
  }
  const groups = Array.from({ length: count }, () => []);
  for (const item of items) {
    let selected = 0; let distance = Math.abs(item.y - centers[0]);
    for (let index = 1; index < count; index++) { const candidate = Math.abs(item.y - centers[index]); if (candidate < distance) { selected = index; distance = candidate; } }
    groups[selected].push(item);
  }
  if (groups.some(group => !group.length)) return null;
  return groups;
}

export function validatePattern(pattern) { if (!pattern || pattern.cols < 3 || pattern.rows < 3 || pattern.squareSize <= 0) throw makeError('CALIBRATION_FAILED'); return pattern; }

export function validateCalibration(value, dimensions = null) {
  if (!value || value.schema !== INTRINSICS_SCHEMA || !value.intrinsics) throw makeError('INTRINSICS_MISMATCH');
  const source = value.intrinsics; const matrix = source.matrix || [[source.fx, 0, source.cx], [0, source.fy, source.cy], [0, 0, 1]]; const imageSize = source.imageSize || (value.image ? [value.image.width, value.image.height] : null);
  if (!Array.isArray(matrix) || matrix.length !== 3 || matrix.some(row => !Array.isArray(row) || row.length !== 3) || !Array.isArray(imageSize) || imageSize.length !== 2) throw makeError('INTRINSICS_MISMATCH');
  const normalized = { schema: INTRINSICS_SCHEMA, intrinsics: { matrix: matrix.map(row => row.map(Number)), distortion: (source.distortion || []).map(Number), imageSize: imageSize.map(Number) }, rmsErrorPx: Number(value.rmsErrorPx ?? value.reprojectionRmsPx ?? 0), lensId: value.lensId ?? null, orientation: Number(value.orientation ?? 1), zoom: value.zoom ?? null };
  if (!normalized.intrinsics.matrix.flat().every(Number.isFinite) || !normalized.intrinsics.distortion.every(Number.isFinite) || !normalized.intrinsics.imageSize.every(value => Number.isFinite(value) && value > 0) || normalized.intrinsics.matrix[0][0] <= 0 || normalized.intrinsics.matrix[1][1] <= 0) throw makeError('INTRINSICS_MISMATCH');
  if (!dimensions) return normalized;
  const [sourceWidth, sourceHeight] = normalized.intrinsics.imageSize;
  const width = Number(dimensions.width); const height = Number(dimensions.height);
  if (!(sourceWidth > 0 && sourceHeight > 0 && width > 0 && height > 0)) throw makeError('INTRINSICS_MISMATCH');
  const scaleX = width / sourceWidth; const scaleY = height / sourceHeight;
  if (Math.abs(scaleX - scaleY) > Math.max(scaleX, scaleY) * 0.005) throw makeError('INTRINSICS_MISMATCH');
  for (const key of ['lensId', 'orientation', 'zoom']) {
    if (dimensions[key] != null && normalized[key] != null && String(dimensions[key]) !== String(normalized[key])) throw makeError('INTRINSICS_MISMATCH');
  }
  normalized.intrinsics.matrix = normalized.intrinsics.matrix.map(row => [...row]);
  normalized.intrinsics.matrix[0][0] *= scaleX; normalized.intrinsics.matrix[0][1] *= scaleX; normalized.intrinsics.matrix[0][2] *= scaleX;
  normalized.intrinsics.matrix[1][0] *= scaleY; normalized.intrinsics.matrix[1][1] *= scaleY; normalized.intrinsics.matrix[1][2] *= scaleY;
  normalized.intrinsics.imageSize = [width, height];
  return normalized;
}

export function validateScale(value) {
  if (!value || value.schema !== SCALE_SCHEMA) throw makeError('DEPTH_SCALE_UNCALIBRATED');
  const focusIndices = value.focusIndices || value.samples?.map(item => item.focus); const distancesM = value.distancesM || value.samples?.map(item => item.distance);
  if (!Array.isArray(focusIndices) || !Array.isArray(distancesM) || focusIndices.length < 2 || focusIndices.length !== distancesM.length) throw makeError('DEPTH_SCALE_UNCALIBRATED');
  const focus = focusIndices.map(Number); const distance = distancesM.map(Number); if (focus.some((item, index) => !Number.isFinite(item) || (index && item <= focus[index - 1])) || distance.some(item => !Number.isFinite(item) || item <= 0)) throw makeError('DEPTH_SCALE_UNCALIBRATED'); const direction = Math.sign(distance.at(-1) - distance[0]); if (!direction || distance.some((item, index) => index && Math.sign(item - distance[index - 1]) !== direction)) throw makeError('DEPTH_SCALE_UNCALIBRATED');
  return { schema: SCALE_SCHEMA, focusIndices: focus, distancesM: distance, residualM: Number(value.residualM ?? value.residualRm ?? 0), sourceFrameCount: value.sourceFrameCount ?? null, focusCurves: value.focusCurves ?? null, intrinsicsSchema: value.intrinsicsSchema ?? null, imageSize: Array.isArray(value.imageSize) ? value.imageSize.map(Number) : null, lensId: value.lensId ?? null, orientation: value.orientation ?? null, zoom: value.zoom ?? null, quality: 'reference-only' };
}

export function canUseMetricDepth(calibration, scaleCalibration) {
  if (!calibration || !scaleCalibration) return false;
  try {
    const intrinsics = validateCalibration(calibration); const scale = validateScale(scaleCalibration);
    if (scale.intrinsicsSchema !== intrinsics.schema || !scale.imageSize || scale.imageSize.some((value, index) => value !== intrinsics.intrinsics.imageSize[index])) return false;
    for (const key of ['lensId', 'orientation', 'zoom']) {
      if (scale[key] != null && intrinsics[key] != null && String(scale[key]) !== String(intrinsics[key])) return false;
    }
    return true;
  } catch { return false; }
}

export function fitScale(samples, distances) {
  if (!Array.isArray(samples) || samples.length < 3 || distances.length !== samples.length) throw makeError('CALIBRATION_FAILED');
  const points = samples.map((focus, index) => ({ focus: Number(focus), distance: Number(distances[index]) })).sort((a, b) => a.focus - b.focus);
  if (points.some((point, index) => !Number.isFinite(point.focus) || !Number.isFinite(point.distance) || point.distance <= 0 || (index && point.focus <= points[index - 1].focus))) throw makeError('CALIBRATION_FAILED');
  const direction = Math.sign(points.at(-1).distance - points[0].distance); if (!direction || points.some((point, index) => index && Math.sign(point.distance - points[index - 1].distance) !== direction)) throw makeError('CALIBRATION_FAILED');
  const count = points.length; const meanFocus = points.reduce((sum, point) => sum + point.focus, 0) / count; const meanDistance = points.reduce((sum, point) => sum + point.distance, 0) / count;
  const denominator = points.reduce((sum, point) => sum + (point.focus - meanFocus) ** 2, 0); const slope = points.reduce((sum, point) => sum + (point.focus - meanFocus) * (point.distance - meanDistance), 0) / Math.max(denominator, 1e-12); const intercept = meanDistance - slope * meanFocus;
  const residualM = Math.sqrt(points.reduce((sum, point) => sum + (slope * point.focus + intercept - point.distance) ** 2, 0) / count);
  return { schema: SCALE_SCHEMA, focusIndices: points.map(point => point.focus), distancesM: points.map(point => point.distance), residualM, quality: 'reference-only' };
}

export function mapDepthToMeters(value, calibration) {
  const normalized = validateScale(calibration); const focus = normalized.focusIndices; const distance = normalized.distancesM;
  if (value <= focus[0]) return distance[0]; if (value >= focus.at(-1)) return distance.at(-1);
  for (let index = 1; index < focus.length; index++) if (value <= focus[index]) { const fraction = (value - focus[index - 1]) / Math.max(1e-9, focus[index] - focus[index - 1]); return distance[index - 1] + fraction * (distance[index] - distance[index - 1]); }
  return distance.at(-1);
}
