function equalizedGray(image) {
  const values = new Uint8Array(image.width * image.height);
  const histogram = new Uint32Array(256);
  for (let pixel = 0; pixel < values.length; pixel += 1) {
    const offset = pixel * 4;
    const value = Math.round(image.data[offset] * 0.2126
      + image.data[offset + 1] * 0.7152
      + image.data[offset + 2] * 0.0722);
    values[pixel] = value;
    histogram[value] += 1;
  }
  const mapping = new Uint8Array(256);
  let cumulative = 0;
  let minimum = 0;
  for (let value = 0; value < 256; value += 1) {
    cumulative += histogram[value];
    if (!minimum && histogram[value]) minimum = cumulative;
    mapping[value] = Math.round(255 * Math.max(0, cumulative - minimum) / Math.max(1, values.length - minimum));
  }
  for (let pixel = 0; pixel < values.length; pixel += 1) {
    values[pixel] = mapping[values[pixel]];
  }
  return values;
}

function morphology(mask, width, height, radius, operation) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let active = operation === "erode";
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          const value = px >= 0 && px < width && py >= 0 && py < height && mask[py * width + px];
          if (operation === "dilate" && value) { active = true; dy = radius + 1; break; }
          if (operation === "erode" && !value) { active = false; dy = radius + 1; break; }
        }
      }
      if (active) output[y * width + x] = 255;
    }
  }
  return output;
}

export function detectMotion(images, threshold = 28) {
  const gray = images.map(equalizedGray);
  const mask = new Uint8Array(gray[0].length);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const values = [gray[0][pixel], gray[1][pixel], gray[2][pixel]].sort((a, b) => a - b);
    if (Math.max(values[1] - values[0], values[2] - values[1]) >= threshold) mask[pixel] = 255;
  }
  const { width, height } = images[0];
  const opened = morphology(morphology(mask, width, height, 1, "erode"), width, height, 1, "dilate");
  const closed = morphology(morphology(opened, width, height, 1, "dilate"), width, height, 1, "erode");
  return morphology(closed, width, height, 2, "dilate");
}

export function protectMotion(weights, mask, referenceIndex = 1) {
  let protectedPixels = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    protectedPixels += 1;
    for (let index = 0; index < weights.length; index += 1) {
      weights[index][pixel] = index === referenceIndex ? 1 : 0;
    }
  }
  const fraction = protectedPixels / mask.length;
  return {
    weights,
    metrics: { detectedFraction: fraction, protectedFraction: fraction },
  };
}
