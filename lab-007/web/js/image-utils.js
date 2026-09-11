const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function validateImageFile(file) {
  if (!file || typeof file.type !== 'string' || !file.type.toLowerCase().startsWith('image/')) {
    throw new TypeError('请选择有效的图片文件');
  }
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_IMAGE_BYTES) {
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

export { MAX_IMAGE_BYTES };
