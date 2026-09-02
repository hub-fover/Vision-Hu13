export function qualityComponents(image, sigma = 0.2) {
  const pixels = image.width * image.height;
  const gray = new Float32Array(pixels);
  const saturation = new Float32Array(pixels);
  const wellExposedness = new Float32Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const red = image.data[offset] / 255;
    const green = image.data[offset + 1] / 255;
    const blue = image.data[offset + 2] / 255;
    gray[pixel] = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const mean = (red + green + blue) / 3;
    saturation[pixel] = Math.sqrt(
      ((red - mean) ** 2 + (green - mean) ** 2 + (blue - mean) ** 2) / 3,
    );
    const gaussian = (value) => Math.exp(-0.5 * ((value - 0.5) / sigma) ** 2);
    wellExposedness[pixel] = gaussian(red) * gaussian(green) * gaussian(blue);
  }
  const contrast = new Float32Array(pixels);
  const at = (x, y) => gray[Math.max(0, Math.min(image.height - 1, y)) * image.width
    + Math.max(0, Math.min(image.width - 1, x))];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = y * image.width + x;
      contrast[pixel] = Math.abs(
        at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) - 4 * gray[pixel],
      );
    }
  }
  return { contrast, saturation, wellExposedness };
}

export function computeQualityWeights(images, options) {
  const components = images.map((image) => qualityComponents(image, options.wellExposedSigma));
  const pixels = images[0].width * images[0].height;
  const weights = components.map(() => new Float32Array(pixels));
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    let sum = 0;
    for (let index = 0; index < 3; index += 1) {
      const component = components[index];
      const value = Math.max(component.contrast[pixel], 1e-6) ** options.weights.contrast
        * Math.max(component.saturation[pixel], 1e-6) ** options.weights.saturation
        * Math.max(component.wellExposedness[pixel], 1e-6) ** options.weights.wellExposedness
        + 1e-12;
      weights[index][pixel] = value;
      sum += value;
    }
    for (let index = 0; index < 3; index += 1) weights[index][pixel] /= sum;
  }
  return { weights, components };
}
