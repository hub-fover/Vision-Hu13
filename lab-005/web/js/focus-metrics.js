export function grayscale(data, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  return gray;
}

export function tenengrad(gray, width, height) {
  let sum = 0; let count = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x; const gx = gray[i + 1] - gray[i - 1]; const gy = gray[i + width] - gray[i - width]; sum += gx * gx + gy * gy; count++;
  }
  return count ? sum / count : 0;
}

export function textureScore(gray, width, height) { return Math.min(1, Math.sqrt(tenengrad(gray, width, height)) * 4); }

export function tileMetric(gray, width, height, tileSize = 8) {
  const cols = Math.ceil(width / tileSize); const rows = Math.ceil(height / tileSize); const out = new Float32Array(cols * rows);
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const x0 = tx * tileSize; const y0 = ty * tileSize; const x1 = Math.min(width, x0 + tileSize); const y1 = Math.min(height, y0 + tileSize); let sum = 0; let count = 0;
    for (let y = Math.max(1, y0); y < Math.min(height - 1, y1); y++) for (let x = Math.max(1, x0); x < Math.min(width - 1, x1); x++) { const i = y * width + x; const gx = gray[i + 1] - gray[i - 1]; const gy = gray[i + width] - gray[i - width]; sum += gx * gx + gy * gy; count++; }
    out[ty * cols + tx] = count ? sum / count : 0;
  }
  return { values: out, cols, rows };
}

export function frameMetric(gray, width, height) { return tenengrad(gray, width, height); }
