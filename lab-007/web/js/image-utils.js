const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']);

export function validateImageFile(file) {
  if (!file || typeof file.type !== 'string' || !file.type.toLowerCase().startsWith('image/')) {
    throw new TypeError('请选择有效的图片文件');
  }
  if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) throw new TypeError('暂不支持这种图片格式');
  if (!Number.isFinite(file.size) || file.size <= 0) throw new RangeError('图片是空文件');
  if (file.size > MAX_IMAGE_BYTES) {
    throw new RangeError('图片不能超过 20 MB');
  }
  return file;
}

export function computeScaledSize(width, height, maxEdge = 1280) {
  if (![width, height, maxEdge].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('图片尺寸无效');
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function defaultCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function encodeCanvas(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片压缩失败')), type, quality);
  });
}

export async function prepareImageBlob(file, {
  decode = globalThis.createImageBitmap,
  createCanvas = defaultCanvas,
  maxEdge = 1280,
  quality = 0.88,
} = {}) {
  validateImageFile(file);
  if (typeof decode !== 'function') throw new Error('当前浏览器无法解码这张图片');
  const bitmap = await decode(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = computeScaledSize(bitmap.width, bitmap.height, maxEdge);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('无法创建图片处理画布');
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await encodeCanvas(canvas, 'image/jpeg', quality);
    return { blob, width, height };
  } finally {
    bitmap.close?.();
  }
}

export { MAX_IMAGE_BYTES };
