import { StitchError } from "./errors.js";

export function largestRectangle(mask, width, height) {
  if (mask.length !== width * height || width < 1 || height < 1) {
    throw new RangeError("mask dimensions do not match");
  }
  let best = { x: 0, y: 0, width: 0, height: 0 };
  let bestArea = 0;
  const heights = new Int32Array(width);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      heights[column] = mask[row * width + column] ?
        heights[column] + 1 :
        0;
    }
    const stack = [];
    for (let column = 0; column <= width; column += 1) {
      const current = column < width ? heights[column] : 0;
      let start = column;
      while (stack.length && stack.at(-1).height > current) {
        const bar = stack.pop();
        const area = bar.height * (column - bar.start);
        if (area > bestArea) {
          bestArea = area;
          best = {
            x: bar.start,
            y: row - bar.height + 1,
            width: column - bar.start,
            height: bar.height,
          };
        }
        start = bar.start;
      }
      if (!stack.length || stack.at(-1).height < current) {
        stack.push({ start, height: current });
      }
    }
  }
  return best;
}

export function autoCrop(mask, width, height, { inset = 2 } = {}) {
  if (inset < 0) throw new RangeError("inset cannot be negative");
  const safe = largestRectangle(mask, width, height);
  if (safe.width <= inset * 2 || safe.height <= inset * 2) {
    throw new StitchError(
      "HOMOGRAPHY_UNSTABLE",
      "The panorama has no safe crop rectangle after the 2px inset.",
    );
  }
  return {
    x: safe.x + inset,
    y: safe.y + inset,
    width: safe.width - inset * 2,
    height: safe.height - inset * 2,
  };
}
