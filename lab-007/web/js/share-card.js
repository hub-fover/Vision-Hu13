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

export async function shareOrDownload(blob, {
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
  createObjectUrl = URL.createObjectURL,
  revokeObjectUrl = URL.revokeObjectURL,
  fileName = 'lab-007-depth.png',
} = {}) {
  const file = new File([blob], fileName, { type: 'image/png' });
  try {
    if (typeof navigatorObject?.share === 'function' && navigatorObject.canShare?.({ files: [file] })) {
      await navigatorObject.share({ files: [file], title: 'LAB 007 单目深度', text: '一张照片的相对深度探索' });
      return 'shared';
    }
  } catch {
    // User cancellation and platform share failures both fall back to a local PNG.
  }

  const url = createObjectUrl(blob);
  try {
    const anchor = documentObject.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    documentObject.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    revokeObjectUrl(url);
  }
  return 'downloaded';
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('分享图生成失败')), 'image/png'));
}

function loadDataImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('二维码生成失败'));
    image.src = url;
  });
}

export async function renderShareCard({ sourceCanvas, depthCanvas, points, mode, canonicalUrl, qrCode = globalThis.QRCode }) {
  if (!qrCode?.toDataURL) throw new Error('二维码运行时未加载');
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#171a18';
  context.font = '700 54px system-ui, sans-serif';
  context.fillText('LAB 007 单目深度', 72, 100);
  context.fillStyle = '#626965';
  context.font = '28px system-ui, sans-serif';
  context.fillText('一张照片的相对深度探索', 72, 148);

  const frame = { x: 72, width: 936, height: 470 };
  context.drawImage(sourceCanvas, frame.x, 205, frame.width, frame.height);
  context.drawImage(depthCanvas, frame.x, 700, frame.width, frame.height);
  context.fillStyle = 'rgba(15,22,18,.82)';
  context.fillRect(72, 205, 100, 42);
  context.fillRect(72, 700, 128, 42);
  context.fillStyle = '#ffffff';
  context.font = '600 22px system-ui, sans-serif';
  context.fillText('原图', 95, 234);
  context.fillText(mode === 'metric' ? '米制深度' : '相对深度', 95, 729);

  for (const [index, point] of normalizeSharePoints(points).entries()) {
    for (const top of [205, 700]) {
      const x = frame.x + point.x * frame.width;
      const y = top + point.y * frame.height;
      context.beginPath();
      context.arc(x, y, 19, 0, Math.PI * 2);
      context.fillStyle = 'rgba(15,22,18,.88)';
      context.fill();
      context.lineWidth = 4;
      context.strokeStyle = '#ffffff';
      context.stroke();
      context.fillStyle = '#ffffff';
      context.font = '700 17px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText(`P${index + 1}`, x, y + 6);
    }
  }
  context.textAlign = 'left';
  context.fillStyle = '#171a18';
  context.font = '600 24px system-ui, sans-serif';
  context.fillText(buildShareCaption(points, mode) || '未选择读数点', 72, 1225);
  context.fillStyle = '#626965';
  context.font = '21px system-ui, sans-serif';
  context.fillText(mode === 'metric' ? '米制结果来自独立远端服务' : '仅表示相对深浅，不是实际距离', 72, 1268);

  const qrUrl = await qrCode.toDataURL(canonicalUrl, { width: 150, margin: 1, errorCorrectionLevel: 'M' });
  const qrImage = await loadDataImage(qrUrl);
  context.drawImage(qrImage, 858, 1210, 150, 150);
  context.fillStyle = '#626965';
  context.font = '18px system-ui, sans-serif';
  context.fillText('打开 LAB 007', 72, 1360);
  return canvasBlob(canvas);
}
