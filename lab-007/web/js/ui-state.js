import { clamp01 } from './depth-utils.js';

export function appendPoint(points, point, limit = 3) {
  const safe = Array.isArray(points) ? points : [];
  const next = [...safe, { ...point, x: clamp01(point.x), y: clamp01(point.y) }];
  return next.slice(-Math.max(1, limit));
}

export function clampCompare(value) {
  return clamp01(value);
}

export function createInitialState() {
  return {
    screen: 'home',
    view: 'compare',
    mode: 'relative',
    compare: 0.5,
    image: null,
    imageBlob: null,
    depth: null,
    points: [],
    requestId: null,
  };
}
