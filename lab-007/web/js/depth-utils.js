function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

export function normalizeDepth(values) {
  if (!Array.isArray(values) && !ArrayBuffer.isView(values)) {
    throw new TypeError('depth values must be array-like');
  }
  const source = Array.from(values, Number);
  let min = Infinity;
  let max = -Infinity;
  for (const value of source) {
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const output = new Float32Array(source.length);
  if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < Number.EPSILON) {
    output.fill(0.5);
    return output;
  }
  const span = max - min;
  source.forEach((value, index) => {
    output[index] = Number.isFinite(value) ? clamp01((value - min) / span) : 0.5;
  });
  return output;
}

export function sampleDepth(depth, width, height, xRatio, yRatio) {
  if (!Array.isArray(depth) && !ArrayBuffer.isView(depth)) {
    throw new TypeError('depth must be array-like');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('invalid depth dimensions');
  }
  if (depth.length !== width * height) throw new RangeError('depth length mismatch');
  const x = Math.min(width - 1, Math.floor(clamp01(xRatio) * width));
  const y = Math.min(height - 1, Math.floor(clamp01(yRatio) * height));
  return Number(depth[y * width + x]);
}

export function mapPointerToImage(clientX, clientY, rect, imageWidth, imageHeight) {
  if (!rect || rect.width <= 0 || rect.height <= 0 || imageWidth <= 0 || imageHeight <= 0) return null;
  const scale = Math.min(rect.width / imageWidth, rect.height / imageHeight);
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  const left = rect.left + (rect.width - renderedWidth) / 2;
  const top = rect.top + (rect.height - renderedHeight) / 2;
  if (clientX < left || clientX > left + renderedWidth || clientY < top || clientY > top + renderedHeight) return null;
  return {
    x: clamp01((clientX - left) / renderedWidth),
    y: clamp01((clientY - top) / renderedHeight),
  };
}

export function depthToTurboRgb(value) {
  const x = clamp01(value);
  const stops = [
    [0, [48, 18, 59]],
    [0.2, [50, 91, 190]],
    [0.4, [28, 161, 148]],
    [0.6, [164, 213, 72]],
    [0.8, [245, 139, 38]],
    [1, [122, 4, 3]],
  ];
  for (let index = 1; index < stops.length; index += 1) {
    if (x <= stops[index][0]) {
      const [startAt, start] = stops[index - 1];
      const [endAt, end] = stops[index];
      const ratio = (x - startAt) / (endAt - startAt);
      return start.map((channel, channelIndex) => Math.round(channel + (end[channelIndex] - channel) * ratio));
    }
  }
  return stops.at(-1)[1].slice();
}

export function formatRelativeDepth(value) {
  return `相对深度 ${Math.round(clamp01(value) * 100)}%`;
}

export function formatMetricDepth(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? `${number.toFixed(2)} m` : '—';
}

export { clamp01 };
