import { FusionError } from "./errors.js";

export function largestRectangle(mask, width, height) {
  const heights = new Int32Array(width);
  let best = { x: 0, y: 0, width: 0, height: 0 };
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      heights[column] = mask[row * width + column] ? heights[column] + 1 : 0;
    }
    const stack = [];
    for (let column = 0; column <= width; column += 1) {
      const current = column < width ? heights[column] : 0;
      let start = column;
      while (stack.length && stack.at(-1).height > current) {
        const item = stack.pop();
        const candidate = {
          x: item.start,
          y: row - item.height + 1,
          width: column - item.start,
          height: item.height,
        };
        if (candidate.width * candidate.height > best.width * best.height) best = candidate;
        start = item.start;
      }
      if (!stack.length || stack.at(-1).height < current) stack.push({ start, height: current });
    }
  }
  return best;
}

export function cropCommonRegion(masks, width, height, inset = 2) {
  if (masks.length !== 3) throw new FusionError("INVALID_IMAGE_COUNT", "Three masks are required.");
  const common = new Uint8Array(width * height);
  for (let pixel = 0; pixel < common.length; pixel += 1) {
    common[pixel] = masks.every((mask) => mask[pixel]) ? 255 : 0;
  }
  const largest = largestRectangle(common, width, height);
  const crop = {
    x: largest.x + inset,
    y: largest.y + inset,
    width: Math.max(0, largest.width - inset * 2),
    height: Math.max(0, largest.height - inset * 2),
  };
  if (!crop.width || !crop.height || crop.width * crop.height < width * height * 0.8) {
    throw new FusionError("EXCESSIVE_CROP", "Alignment would discard more than 20% of the frame.");
  }
  return crop;
}

export function cropImage(image, crop) {
  const data = new Uint8ClampedArray(crop.width * crop.height * 4);
  for (let row = 0; row < crop.height; row += 1) {
    const sourceStart = ((crop.y + row) * image.width + crop.x) * 4;
    data.set(image.data.subarray(sourceStart, sourceStart + crop.width * 4), row * crop.width * 4);
  }
  return { width: crop.width, height: crop.height, data };
}
