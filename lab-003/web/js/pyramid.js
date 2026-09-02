function downsample(source, width, height, channels) {
  const nextWidth = Math.max(1, Math.ceil(width / 2));
  const nextHeight = Math.max(1, Math.ceil(height / 2));
  const data = new Float32Array(nextWidth * nextHeight * channels);
  for (let y = 0; y < nextHeight; y += 1) {
    for (let x = 0; x < nextWidth; x += 1) {
      let samples = 0;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const sx = x * 2 + dx;
          const sy = y * 2 + dy;
          if (sx >= width || sy >= height) continue;
          samples += 1;
          for (let channel = 0; channel < channels; channel += 1) {
            data[(y * nextWidth + x) * channels + channel]
              += source[(sy * width + sx) * channels + channel];
          }
        }
      }
      for (let channel = 0; channel < channels; channel += 1) {
        data[(y * nextWidth + x) * channels + channel] /= samples;
      }
    }
  }
  return { data, width: nextWidth, height: nextHeight };
}

function upsample(source, sourceWidth, sourceHeight, width, height, channels) {
  const data = new Float32Array(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    const fy = height === 1 ? 0 : y * (sourceHeight - 1) / (height - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x += 1) {
      const fx = width === 1 ? 0 : x * (sourceWidth - 1) / (width - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const wx = fx - x0;
      for (let channel = 0; channel < channels; channel += 1) {
        const top = source[(y0 * sourceWidth + x0) * channels + channel] * (1 - wx)
          + source[(y0 * sourceWidth + x1) * channels + channel] * wx;
        const bottom = source[(y1 * sourceWidth + x0) * channels + channel] * (1 - wx)
          + source[(y1 * sourceWidth + x1) * channels + channel] * wx;
        data[(y * width + x) * channels + channel] = top * (1 - wy) + bottom * wy;
      }
    }
  }
  return data;
}

function imageFloat(image) {
  const data = new Float32Array(image.width * image.height * 3);
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    data[pixel * 3] = image.data[pixel * 4] / 255;
    data[pixel * 3 + 1] = image.data[pixel * 4 + 1] / 255;
    data[pixel * 3 + 2] = image.data[pixel * 4 + 2] / 255;
  }
  return data;
}

function gaussianPyramid(data, width, height, channels, levels) {
  const result = [{ data, width, height }];
  while (result.length < levels && Math.min(result.at(-1).width, result.at(-1).height) >= 4) {
    const level = result.at(-1);
    result.push(downsample(level.data, level.width, level.height, channels));
  }
  return result;
}

function laplacianPyramid(image, levels) {
  const gaussian = gaussianPyramid(imageFloat(image), image.width, image.height, 3, levels);
  return gaussian.map((level, index) => {
    if (index === gaussian.length - 1) return level;
    const next = gaussian[index + 1];
    const expanded = upsample(next.data, next.width, next.height, level.width, level.height, 3);
    const data = new Float32Array(level.data.length);
    for (let offset = 0; offset < data.length; offset += 1) data[offset] = level.data[offset] - expanded[offset];
    return { ...level, data };
  });
}

export function fusePyramids(images, weights, levels = 5) {
  const imagePyramids = images.map((image) => laplacianPyramid(image, levels));
  const weightPyramids = weights.map((weight) => gaussianPyramid(
    weight,
    images[0].width,
    images[0].height,
    1,
    levels,
  ));
  const count = Math.min(...imagePyramids.map((pyramid) => pyramid.length));
  const fused = [];
  for (let level = 0; level < count; level += 1) {
    const shape = imagePyramids[0][level];
    const data = new Float32Array(shape.width * shape.height * 3);
    const weightSum = new Float32Array(shape.width * shape.height);
    for (let index = 0; index < images.length; index += 1) {
      const pixels = imagePyramids[index][level].data;
      const levelWeights = weightPyramids[index][level].data;
      for (let pixel = 0; pixel < weightSum.length; pixel += 1) {
        const weight = levelWeights[pixel];
        weightSum[pixel] += weight;
        data[pixel * 3] += pixels[pixel * 3] * weight;
        data[pixel * 3 + 1] += pixels[pixel * 3 + 1] * weight;
        data[pixel * 3 + 2] += pixels[pixel * 3 + 2] * weight;
      }
    }
    for (let pixel = 0; pixel < weightSum.length; pixel += 1) {
      const divisor = Math.max(1e-8, weightSum[pixel]);
      data[pixel * 3] /= divisor;
      data[pixel * 3 + 1] /= divisor;
      data[pixel * 3 + 2] /= divisor;
    }
    fused.push({ ...shape, data });
  }
  let reconstructed = fused.at(-1);
  for (let level = fused.length - 2; level >= 0; level -= 1) {
    const target = fused[level];
    const expanded = upsample(
      reconstructed.data,
      reconstructed.width,
      reconstructed.height,
      target.width,
      target.height,
      3,
    );
    for (let offset = 0; offset < expanded.length; offset += 1) expanded[offset] += target.data[offset];
    reconstructed = { ...target, data: expanded };
  }
  const output = new Uint8ClampedArray(reconstructed.width * reconstructed.height * 4);
  for (let pixel = 0; pixel < reconstructed.width * reconstructed.height; pixel += 1) {
    output[pixel * 4] = Math.round(Math.max(0, Math.min(1, reconstructed.data[pixel * 3])) * 255);
    output[pixel * 4 + 1] = Math.round(Math.max(0, Math.min(1, reconstructed.data[pixel * 3 + 1])) * 255);
    output[pixel * 4 + 2] = Math.round(Math.max(0, Math.min(1, reconstructed.data[pixel * 3 + 2])) * 255);
    output[pixel * 4 + 3] = 255;
  }
  return { width: reconstructed.width, height: reconstructed.height, data: output };
}
