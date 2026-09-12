import { depthToTurboRgb } from './depth-utils.js';

export function drawSource(image, canvas) {
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
}

export function drawDepth(depth, width, height, canvas) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  const pixels = context.createImageData(width, height);
  for (let index = 0; index < depth.length; index += 1) {
    const [red, green, blue] = depthToTurboRgb(depth[index]);
    const offset = index * 4;
    pixels.data[offset] = red;
    pixels.data[offset + 1] = green;
    pixels.data[offset + 2] = blue;
    pixels.data[offset + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取图片内容'));
    image.src = url;
  });
}
