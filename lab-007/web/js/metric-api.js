export function metricDepthAvailable(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return false;
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateMetricResponse(payload) {
  if (!payload || typeof payload !== 'object') throw new TypeError('invalid metric response');
  const { width, height, depth, unit, model } = payload;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new TypeError('invalid metric dimensions');
  }
  if (unit !== 'm') throw new TypeError('metric response unit must be m');
  if (!Array.isArray(depth) && !ArrayBuffer.isView(depth)) throw new TypeError('metric depth must be array-like');
  if (depth.length !== width * height) throw new TypeError('metric depth length mismatch');
  const values = Array.from(depth, Number);
  if (!values.every(value => Number.isFinite(value) && value >= 0)) {
    throw new TypeError('metric depth contains invalid values');
  }
  return { width, height, depth: values, unit, model: String(model || 'Metric depth model') };
}

export async function requestMetricDepth(baseUrl, imageBlob, { signal, timeoutMs = 45000 } = {}) {
  if (!metricDepthAvailable(baseUrl)) throw new Error('米制深度服务未连接');
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(new DOMException('请求超时', 'TimeoutError')), timeoutMs);
  const abort = () => timeoutController.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const form = new FormData();
    form.append('image', imageBlob, 'image.jpg');
    const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/depth/metric`;
    const response = await fetch(endpoint, { method: 'POST', body: form, signal: timeoutController.signal });
    if (!response.ok) throw new Error(`米制深度服务返回 ${response.status}`);
    return validateMetricResponse(await response.json());
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
