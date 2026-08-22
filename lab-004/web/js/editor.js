const CANVAS = Object.freeze({ width: 640, height: 360, minSize: 64 });
export const ROI_HIT_RADIUS = 36;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function clampRoi(roi, bounds = CANVAS) {
  const width = clamp(Number(roi.width) || bounds.minSize, bounds.minSize, bounds.width);
  const height = clamp(Number(roi.height) || bounds.minSize, bounds.minSize, bounds.height);
  return {
    x: clamp(Number(roi.x) || 0, 0, bounds.width - width),
    y: clamp(Number(roi.y) || 0, 0, bounds.height - height),
    width,
    height,
  };
}

export function moveRoi(roi, delta, bounds = CANVAS) {
  const current = clampRoi(roi, bounds);
  return clampRoi({ ...current, x: current.x + delta.x, y: current.y + delta.y }, bounds);
}

export function resizeRoi(roi, handle, delta, bounds = CANVAS) {
  const current = clampRoi(roi, bounds);
  const right = current.x + current.width;
  const bottom = current.y + current.height;
  let next;
  if (handle === 0) {
    const x = clamp(current.x + delta.x, 0, right - bounds.minSize);
    const y = clamp(current.y + delta.y, 0, bottom - bounds.minSize);
    next = { x, y, width: right - x, height: bottom - y };
  } else if (handle === 1) {
    const rightEdge = clamp(right + delta.x, current.x + bounds.minSize, bounds.width);
    const y = clamp(current.y + delta.y, 0, bottom - bounds.minSize);
    next = { x: current.x, y, width: rightEdge - current.x, height: bottom - y };
  } else if (handle === 2) {
    const rightEdge = clamp(right + delta.x, current.x + bounds.minSize, bounds.width);
    const bottomEdge = clamp(bottom + delta.y, current.y + bounds.minSize, bounds.height);
    next = { x: current.x, y: current.y, width: rightEdge - current.x, height: bottomEdge - current.y };
  } else {
    const x = clamp(current.x + delta.x, 0, right - bounds.minSize);
    const bottomEdge = clamp(bottom + delta.y, current.y + bounds.minSize, bounds.height);
    next = { x, y: current.y, width: right - x, height: bottomEdge - current.y };
  }
  return clampRoi(next, bounds);
}

export function nearestRoiHandle(point, roi, hitRadius = ROI_HIT_RADIUS) {
  const current = clampRoi(roi);
  const handles = [[current.x, current.y], [current.x + current.width, current.y], [current.x + current.width, current.y + current.height], [current.x, current.y + current.height]];
  let best = -1;
  let distance = hitRadius;
  handles.forEach(([x, y], index) => {
    const candidateDistance = Math.hypot(point.x - x, point.y - y);
    if (candidateDistance <= distance) { distance = candidateDistance; best = index; }
  });
  return best;
}

export function roiContains(point, roi) {
  const current = clampRoi(roi);
  return point.x >= current.x && point.x <= current.x + current.width && point.y >= current.y && point.y <= current.y + current.height;
}
