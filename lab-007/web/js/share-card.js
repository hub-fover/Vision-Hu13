import { clamp01, formatMetricDepth, formatRelativeDepth } from './depth-utils.js';

export function normalizeSharePoints(points) {
  return (Array.isArray(points) ? points : []).slice(0, 3).map(point => ({
    ...point,
    x: clamp01(point.x),
    y: clamp01(point.y),
  }));
}

export function buildShareCaption(points, mode) {
  return normalizeSharePoints(points).map((point, index) => {
    const value = mode === 'metric' ? formatMetricDepth(point.value) : formatRelativeDepth(point.value);
    return `P${index + 1} ${value}`;
  }).join(' · ');
}
