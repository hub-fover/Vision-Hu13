import { computeHomography } from "./geometry.js";

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, Number(value)));
const byte = (value) => Math.max(0, Math.min(255, Math.round(value)));

export function blendChannel(backdrop, source, mode = "normal") {
  if (mode === "normal") return source;
  if (mode === "multiply") return backdrop * source;
  if (mode !== "soft-light") {
    throw new Error("mode must be normal, multiply, or soft-light");
  }
  const d = backdrop <= 0.25
    ? ((16 * backdrop - 12) * backdrop + 4) * backdrop
    : Math.sqrt(backdrop);
  return source <= 0.5
    ? backdrop - (1 - 2 * source) * backdrop * (1 - backdrop)
    : backdrop + (2 * source - 1) * (d - backdrop);
}

export function applyBrightness(source, gain) {
  const amount = clamp(gain, 0.6, 1.4);
  const output = new Uint8ClampedArray(source);
  for (let i = 0; i < output.length; i += 4) {
    output[i] = byte(output[i] * amount);
    output[i + 1] = byte(output[i + 1] * amount);
    output[i + 2] = byte(output[i + 2] * amount);
  }
  return output;
}

export function applyTint(source, color, strength = 0) {
  const amount = clamp(strength);
  const output = new Uint8ClampedArray(source);
  for (let i = 0; i < output.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      output[i + channel] = byte(output[i + channel] * (1 - amount) +
        color[channel] * amount);
    }
  }
  return output;
}

export function applySaturation(source, saturation = 1) {
  const amount = Math.max(0, Number(saturation));
  const output = new Uint8ClampedArray(source);
  for (let i = 0; i < output.length; i += 4) {
    const luminance = 0.2126 * output[i] + 0.7152 * output[i + 1] +
      0.0722 * output[i + 2];
    for (let channel = 0; channel < 3; channel += 1) {
      output[i + channel] = byte(luminance + (output[i + channel] - luminance) * amount);
    }
  }
  return output;
}

export function applyTexture(source, detail, strength = 0) {
  const output = new Uint8ClampedArray(source);
  if (Number(strength) === 0) return output;
  for (let pixel = 0; pixel < output.length / 4; pixel += 1) {
    const modulation = 1 + Number(strength) * (detail[pixel] || 0);
    for (let channel = 0; channel < 3; channel += 1) {
      output[pixel * 4 + channel] = byte(output[pixel * 4 + channel] * modulation);
    }
  }
  return output;
}

function gaussianKernel(sigma) {
  const radius = Math.min(64, Math.max(1, Math.ceil(sigma * 3)));
  const kernel = [];
  let total = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    kernel.push(weight);
    total += weight;
  }
  return kernel.map((weight) => weight / total);
}

export function blurPremultiplied(source, width, height, sigma) {
  if (!(Number(sigma) > 0)) return source.slice();
  const kernel = gaussianKernel(Number(sigma));
  const radius = (kernel.length - 1) / 2;
  const horizontal = new Uint8ClampedArray(source.length);
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let weightTotal = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = x + offset;
        if (sampleX < 0 || sampleX >= width) continue;
        const weight = kernel[offset + radius];
        const sourceIndex = (y * width + sampleX) * 4;
        const sampleAlpha = source[sourceIndex + 3] / 255;
        red += source[sourceIndex] * sampleAlpha * weight;
        green += source[sourceIndex + 1] * sampleAlpha * weight;
        blue += source[sourceIndex + 2] * sampleAlpha * weight;
        alpha += source[sourceIndex + 3] * weight;
        weightTotal += weight;
      }
      const targetIndex = (y * width + x) * 4;
      horizontal[targetIndex] = byte(red / weightTotal);
      horizontal[targetIndex + 1] = byte(green / weightTotal);
      horizontal[targetIndex + 2] = byte(blue / weightTotal);
      horizontal[targetIndex + 3] = byte(alpha / weightTotal);
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let weightTotal = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      const targetIndex = (y * width + x) * 4;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = y + offset;
        if (sampleY < 0 || sampleY >= height) continue;
        const weight = kernel[offset + radius];
        const sourceIndex = (sampleY * width + x) * 4;
        red += horizontal[sourceIndex] * weight;
        green += horizontal[sourceIndex + 1] * weight;
        blue += horizontal[sourceIndex + 2] * weight;
        alpha += horizontal[sourceIndex + 3] * weight;
        weightTotal += weight;
      }
      const finalAlpha = alpha / weightTotal;
      output[targetIndex + 3] = byte(finalAlpha);
      if (finalAlpha <= 1e-8) continue;
      output[targetIndex] = byte((red / weightTotal) * 255 / finalAlpha);
      output[targetIndex + 1] = byte((green / weightTotal) * 255 / finalAlpha);
      output[targetIndex + 2] = byte((blue / weightTotal) * 255 / finalAlpha);
    }
  }
  return output;
}

function backgroundHighFrequency(background, width, height) {
  const lowFrequency = blurPremultiplied(background, width, height, 3);
  const detail = new Float32Array(width * height);
  for (let pixel = 0; pixel < detail.length; pixel += 1) {
    const index = pixel * 4;
    const residual = (
      background[index] - lowFrequency[index] +
      background[index + 1] - lowFrequency[index + 1] +
      background[index + 2] - lowFrequency[index + 2]
    ) / 3;
    detail[pixel] = residual / 127.5;
  }
  return detail;
}

export function normalizeShadow(value) {
  const options = value && typeof value === "object" ? value : {};
  return {
    enabled: Boolean(options.enabled),
    offsetX: Number.isFinite(Number(options.offsetX)) ? Number(options.offsetX) : 8,
    offsetY: Number.isFinite(Number(options.offsetY)) ? Number(options.offsetY) : 8,
    blur: Math.max(0, Number.isFinite(Number(options.blur)) ? Number(options.blur) : 12),
    opacity: clamp(Number.isFinite(Number(options.opacity)) ? Number(options.opacity) : 0.35),
  };
}

export function premultiplyRgba([red, green, blue, alpha]) {
  const amount = alpha / 255;
  return [red * amount, green * amount, blue * amount, alpha];
}

export function unpremultiplyRgba([red, green, blue, alpha]) {
  if (alpha <= 1e-8) return [0, 0, 0, 0];
  const inverse = 255 / alpha;
  return [byte(red * inverse), byte(green * inverse), byte(blue * inverse), byte(alpha)];
}

function premultipliedAt(data, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return [0, 0, 0, 0];
  return premultiplyRgba(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
}

export function samplePremultipliedBilinear(data, width, height, x, y) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const fx = x - left;
  const fy = y - top;
  const samples = [
    [premultipliedAt(data, width, height, left, top), (1 - fx) * (1 - fy)],
    [premultipliedAt(data, width, height, left + 1, top), fx * (1 - fy)],
    [premultipliedAt(data, width, height, left, top + 1), (1 - fx) * fy],
    [premultipliedAt(data, width, height, left + 1, top + 1), fx * fy],
  ];
  const premultiplied = [0, 0, 0, 0];
  samples.forEach(([pixel, weight]) => {
    for (let channel = 0; channel < 4; channel += 1) {
      premultiplied[channel] += pixel[channel] * weight;
    }
  });
  return unpremultiplyRgba(premultiplied);
}

export function fitAssetPixels(asset, width, height, fitMode = "contain") {
  if (!["fill", "contain"].includes(fitMode)) {
    throw new Error("fitMode must be fill or contain");
  }
  const targetWidth = Math.max(1, Math.round(width));
  const targetHeight = Math.max(1, Math.round(height));
  const scale = fitMode === "fill"
    ? Math.max(targetWidth / asset.width, targetHeight / asset.height)
    : Math.min(targetWidth / asset.width, targetHeight / asset.height);
  const drawWidth = asset.width * scale;
  const drawHeight = asset.height * scale;
  const left = (targetWidth - drawWidth) / 2;
  const top = (targetHeight - drawHeight) / 2;
  const data = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = (x - left) / scale;
      const sourceY = (y - top) / scale;
      if (sourceX < 0 || sourceY < 0 ||
          sourceX > asset.width - 1 || sourceY > asset.height - 1) continue;
      data.set(samplePremultipliedBilinear(
        asset.data, asset.width, asset.height, sourceX, sourceY),
      (y * targetWidth + x) * 4);
    }
  }
  return { data, width: targetWidth, height: targetHeight };
}

function pointInside([x, y], quad) {
  let sign = 0;
  for (let index = 0; index < 4; index += 1) {
    const a = quad[index];
    const b = quad[(index + 1) % 4];
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(cross) < 1e-9) continue;
    if (!sign) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

function project(matrix, x, y) {
  const w = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2];
  return [
    (matrix[0][0] * x + matrix[0][1] * y + matrix[0][2]) / w,
    (matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]) / w,
  ];
}

export function warpAsset(asset, quad, width, height) {
  const output = new Uint8ClampedArray(width * height * 4);
  const sourceQuad = [
    [0, 0], [asset.width - 1, 0],
    [asset.width - 1, asset.height - 1], [0, asset.height - 1],
  ];
  const inverse = asset.width > 1 && asset.height > 1
    ? computeHomography(quad, sourceQuad)
    : null;
  const minimumX = Math.max(0, Math.floor(Math.min(...quad.map((point) => point[0]))));
  const maximumX = Math.min(width - 1, Math.ceil(Math.max(...quad.map((point) => point[0]))));
  const minimumY = Math.max(0, Math.floor(Math.min(...quad.map((point) => point[1]))));
  const maximumY = Math.min(height - 1, Math.ceil(Math.max(...quad.map((point) => point[1]))));
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      if (!pointInside([x, y], quad)) continue;
      const [sourceX, sourceY] = inverse ? project(inverse, x, y) : [0, 0];
      const pixel = inverse
        ? samplePremultipliedBilinear(
          asset.data, asset.width, asset.height, sourceX, sourceY)
        : asset.data.slice(0, 4);
      output.set(pixel, (y * width + x) * 4);
    }
  }
  return { data: output, width, height };
}

function meanColor(data, mask) {
  const sums = [0, 0, 0];
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = mask ? mask[i + 3] / 255 : 1;
    if (!alpha) continue;
    sums[0] += data[i] * alpha;
    sums[1] += data[i + 1] * alpha;
    sums[2] += data[i + 2] * alpha;
    weight += alpha;
  }
  return weight ? sums.map((value) => value / weight) : [0, 0, 0];
}

function meanLuminance(data, mask) {
  const color = meanColor(data, mask);
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

function sourceOver(background, foreground, opacity, mode) {
  const output = new Uint8ClampedArray(background);
  for (let i = 0; i < output.length; i += 4) {
    const sourceAlpha = foreground[i + 3] / 255 * opacity;
    if (!sourceAlpha) continue;
    const backAlpha = background[i + 3] / 255;
    const outAlpha = sourceAlpha + backAlpha * (1 - sourceAlpha);
    for (let channel = 0; channel < 3; channel += 1) {
      const backdrop = background[i + channel] / 255;
      const source = foreground[i + channel] / 255;
      const blended = blendChannel(backdrop, source, mode);
      const premultiplied = blended * sourceAlpha +
        backdrop * backAlpha * (1 - sourceAlpha);
      output[i + channel] = byte(255 * premultiplied / Math.max(outAlpha, 1e-8));
    }
    output[i + 3] = byte(255 * outAlpha);
  }
  return output;
}

function makeShadow(warped, width, height, options) {
  const shadow = new Uint8ClampedArray(width * height * 4);
  if (!options.enabled) return shadow;
  const radius = Math.max(0, Math.ceil(options.blur * 2));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = warped[(y * width + x) * 4 + 3];
      if (!alpha) continue;
      const centerX = Math.round(x + options.offsetX);
      const centerY = Math.round(y + options.offsetY);
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const targetX = centerX + offsetX;
          const targetY = centerY + offsetY;
          if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue;
          const distance = Math.hypot(offsetX, offsetY);
          const falloff = radius ? Math.max(0, 1 - distance / (radius + 1)) : 1;
          const index = (targetY * width + targetX) * 4;
          shadow[index + 3] = Math.max(shadow[index + 3],
            byte(alpha * options.opacity * falloff));
        }
      }
    }
  }
  return shadow;
}

export function blendComposite(background, asset, quad, options = {}) {
  const width = background.width;
  const height = background.height;
  const opacity = clamp(options.opacity ?? 1);
  if (opacity === 0) {
    return { data: new Uint8ClampedArray(background.data), width, height };
  }
  const edge = (first, second) =>
    Math.hypot(second[0] - first[0], second[1] - first[1]);
  const fitted = fitAssetPixels(
    asset,
    Math.max(2, Math.round((edge(quad[0], quad[1]) + edge(quad[3], quad[2])) / 2)),
    Math.max(2, Math.round((edge(quad[0], quad[3]) + edge(quad[1], quad[2])) / 2)),
    options.fitMode || "contain",
  );
  let warped = warpAsset(fitted, quad, width, height).data;
  if (options.brightnessMatch !== false) {
    const sourceMean = meanLuminance(warped, warped);
    const backgroundMean = meanLuminance(background.data, warped);
    warped = applyBrightness(warped, backgroundMean / Math.max(sourceMean, 1e-6));
  }
  warped = applyTint(warped, meanColor(background.data, warped), options.tintStrength || 0);
  warped = applySaturation(warped, options.saturation ?? 1);
  const scaledBlur = Number(options.blurPx || 0) * Math.max(width, height) / 1080;
  warped = blurPremultiplied(warped, width, height, scaledBlur);
  warped = applyTexture(
    warped,
    backgroundHighFrequency(background.data, width, height),
    options.textureStrength || 0,
  );
  const shadow = makeShadow(warped, width, height, normalizeShadow(options.shadow));
  const withShadow = sourceOver(background.data, shadow, 1, "normal");
  const result = sourceOver(withShadow, warped, opacity, options.blendMode || "normal");
  return { data: result, width, height };
}
