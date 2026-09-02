import { computePerspectiveGuide } from "./geometry.js";
import { premultiplyRgba, unpremultiplyRgba } from "./blending.js";

export { premultiplyRgba, unpremultiplyRgba };

export function replaceTrackedFont(fontSet, previousFace, nextFace) {
  if (previousFace) fontSet.delete(previousFace);
  fontSet.add(nextFace);
  return nextFace;
}

export async function installUploadedFont(
  file, family = "VisionHubUploaded", previousFace = null,
) {
  const url = URL.createObjectURL(file);
  try {
    const font = new FontFace(family, `url("${url}")`);
    await font.load();
    replaceTrackedFont(document.fonts, previousFace, font);
    return { family, face: font };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createTextCanvas(text, options = {}) {
  const {
    fontFamily = '"Microsoft YaHei", "PingFang SC", sans-serif',
    fontSize = 96,
    color = "#ffffff",
    opacity = 1,
    strokeWidth = 0,
    strokeColor = "#000000",
    letterSpacing = 0,
    lineSpacing = 12,
    vertical = false,
  } = options;
  const lines = vertical ? [...(text || " ")].map((character) => character || " ") :
    String(text || " ").split("\n");
  const probe = document.createElement("canvas");
  const context = probe.getContext("2d");
  context.font = `${fontSize}px ${fontFamily}`;
  const widths = lines.map((line) => [...(line || " ")].reduce((total, character, index) =>
    total + context.measureText(character).width + (index ? letterSpacing : 0), 0));
  probe.width = Math.max(1, Math.ceil(Math.max(...widths) + strokeWidth * 4));
  probe.height = Math.max(1, Math.ceil(
    lines.length * (fontSize * 1.25) + Math.max(0, lines.length - 1) * lineSpacing +
    strokeWidth * 4));
  const draw = probe.getContext("2d");
  draw.font = `${fontSize}px ${fontFamily}`;
  draw.textBaseline = "top";
  draw.globalAlpha = Math.max(0, Math.min(1, opacity));
  draw.fillStyle = color;
  draw.strokeStyle = strokeColor;
  draw.lineWidth = Math.max(0, strokeWidth * 2);
  lines.forEach((line, lineIndex) => {
    let x = strokeWidth * 2;
    const y = strokeWidth * 2 + lineIndex * (fontSize * 1.25 + lineSpacing);
    [...(line || " ")].forEach((character) => {
      if (strokeWidth) draw.strokeText(character, x, y);
      draw.fillText(character, x, y);
      x += draw.measureText(character).width + letterSpacing;
    });
  });
  return cropCanvas(probe);
}

function cropCanvas(canvas) {
  const context = canvas.getContext("2d");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!image.data[(y * canvas.width + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return canvas;
  const output = document.createElement("canvas");
  output.width = right - left + 1;
  output.height = bottom - top + 1;
  output.getContext("2d").drawImage(canvas, left, top, output.width, output.height,
    0, 0, output.width, output.height);
  return output;
}

export async function loadImage(source) {
  const blob = source instanceof Blob ? source : await fetch(source).then((response) => {
    if (!response.ok) throw new Error(`无法加载示例背景（${response.status}）`);
    return response.blob();
  });
  return createImageBitmap(blob);
}

export function drawImageBitmapToCanvas(
  image, canvasFactory = () => document.createElement("canvas"),
) {
  const canvas = canvasFactory();
  canvas.width = image.width;
  canvas.height = image.height;
  try {
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas;
  } finally {
    image.close?.();
  }
}

export const imageToCanvas = drawImageBitmapToCanvas;
export function canvasPixels(canvas) {
  const image = canvas.getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, canvas.width, canvas.height);
  return { data: image.data, width: image.width, height: image.height };
}

export function fitAssetCanvas(asset, width, height, fitMode = "contain") {
  if (!["fill", "contain"].includes(fitMode)) throw new Error("fitMode must be fill or contain");
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(width));
  output.height = Math.max(1, Math.round(height));
  const scale = fitMode === "fill"
    ? Math.max(output.width / asset.width, output.height / asset.height)
    : Math.min(output.width / asset.width, output.height / asset.height);
  const drawWidth = asset.width * scale;
  const drawHeight = asset.height * scale;
  output.getContext("2d").drawImage(asset,
    (output.width - drawWidth) / 2, (output.height - drawHeight) / 2,
    drawWidth, drawHeight);
  return output;
}

function interpolate(quad, u, v) {
  const top = [
    quad[0][0] + (quad[1][0] - quad[0][0]) * u,
    quad[0][1] + (quad[1][1] - quad[0][1]) * u,
  ];
  const bottom = [
    quad[3][0] + (quad[2][0] - quad[3][0]) * u,
    quad[3][1] + (quad[2][1] - quad[3][1]) * u,
  ];
  return [
    top[0] + (bottom[0] - top[0]) * v,
    top[1] + (bottom[1] - top[1]) * v,
  ];
}

export function triangleTransform(source, destination) {
  const [s0, s1, s2] = source;
  const denominator = s0[0] * (s1[1] - s2[1]) +
    s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]);
  if (Math.abs(denominator) < 1e-8) return null;
  const solve = (values) => [
    (values[0] * (s1[1] - s2[1]) + values[1] * (s2[1] - s0[1]) +
      values[2] * (s0[1] - s1[1])) / denominator,
    (values[0] * (s2[0] - s1[0]) + values[1] * (s0[0] - s2[0]) +
      values[2] * (s1[0] - s0[0])) / denominator,
    (values[0] * (s1[0] * s2[1] - s2[0] * s1[1]) +
      values[1] * (s2[0] * s0[1] - s0[0] * s2[1]) +
      values[2] * (s0[0] * s1[1] - s1[0] * s0[1])) / denominator,
  ];
  const x = solve(destination.map((point) => point[0]));
  const y = solve(destination.map((point) => point[1]));
  return [x[0], y[0], x[1], y[1], x[2], y[2]];
}

function drawTriangle(context, image, source, destination) {
  const [d0, d1, d2] = destination;
  const transform = triangleTransform(source, destination);
  if (!transform) return;
  context.save();
  context.beginPath();
  context.moveTo(...d0);
  context.lineTo(...d1);
  context.lineTo(...d2);
  context.closePath();
  context.clip();
  context.setTransform(...transform);
  context.drawImage(image, 0, 0);
  context.restore();
}

export function drawAdaptiveTriangleMeshPreview(context, asset, quad, options = {}) {
  const steps = meshSubdivisionCount(quad);
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, options.opacity ?? 1));
  context.globalCompositeOperation =
    options.blendMode === "multiply" ? "multiply" :
      options.blendMode === "soft-light" ? "soft-light" : "source-over";
  for (let row = 0; row < steps; row += 1) {
    for (let column = 0; column < steps; column += 1) {
      const u0 = column / steps;
      const u1 = (column + 1) / steps;
      const v0 = row / steps;
      const v1 = (row + 1) / steps;
      const sources = [
        [u0 * asset.width, v0 * asset.height], [u1 * asset.width, v0 * asset.height],
        [u1 * asset.width, v1 * asset.height], [u0 * asset.width, v1 * asset.height],
      ];
      const targets = [
        interpolate(quad, u0, v0), interpolate(quad, u1, v0),
        interpolate(quad, u1, v1), interpolate(quad, u0, v1),
      ];
      drawTriangle(context, asset, sources.slice(0, 3), targets.slice(0, 3));
      drawTriangle(context, asset, [sources[0], sources[2], sources[3]],
        [targets[0], targets[2], targets[3]]);
    }
  }
  context.restore();
}

export function meshSubdivisionCount(quad) {
  const longest = Math.max(...quad.map((point, index) => {
    const next = quad[(index + 1) % 4];
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  }));
  return Math.max(4, Math.min(28, Math.ceil(longest / 48)));
}

export function drawGridOverlay(context, quad, divisions = 4) {
  context.save();
  context.strokeStyle = "rgba(37, 99, 235, .62)";
  context.lineWidth = 1;
  context.setLineDash([4, 4]);
  for (let index = 1; index < divisions; index += 1) {
    const amount = index / divisions;
    const lines = [
      [interpolate(quad, amount, 0), interpolate(quad, amount, 1)],
      [interpolate(quad, 0, amount), interpolate(quad, 1, amount)],
    ];
    lines.forEach(([start, end]) => {
      context.beginPath();
      context.moveTo(...start);
      context.lineTo(...end);
      context.stroke();
    });
  }
  context.restore();
}

export function drawVanishingOverlay(context, quad) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const guide = computePerspectiveGuide(quad, [width, height]);
  const colors = { u: "#06b6d4", v: "#f97316" };
  const edgePairs = {
    u: [[0, 1], [3, 2]],
    v: [[0, 3], [1, 2]],
  };
  const clamp = ([x, y]) => [
    Math.min(width, Math.max(0, x)),
    Math.min(height, Math.max(0, y)),
  ];
  const midpoint = (first, second) => [
    (first[0] + second[0]) / 2,
    (first[1] + second[1]) / 2,
  ];
  const drawLine = (start, end) => {
    context.beginPath();
    context.moveTo(...clamp(start));
    context.lineTo(...clamp(end));
    context.stroke();
  };
  const drawArrow = (anchor, direction, color) => {
    const tip = clamp(anchor);
    const inside = clamp([
      tip[0] - direction[0] * 20,
      tip[1] - direction[1] * 20,
    ]);
    context.strokeStyle = color;
    drawLine(inside, tip);
    const perpendicular = [-direction[1], direction[0]];
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(...tip);
    context.lineTo(...clamp([
      tip[0] - direction[0] * 10 + perpendicular[0] * 5,
      tip[1] - direction[1] * 10 + perpendicular[1] * 5,
    ]));
    context.lineTo(...clamp([
      tip[0] - direction[0] * 10 - perpendicular[0] * 5,
      tip[1] - direction[1] * 10 - perpendicular[1] * 5,
    ]));
    context.closePath();
    context.fill();
  };
  const label = (value, location, color) => {
    const [x, y] = clamp(location);
    context.fillStyle = color;
    context.font = "600 12px system-ui, sans-serif";
    context.textBaseline = "middle";
    context.fillText(value, Math.min(width - 8, Math.max(8, x)),
      Math.min(height - 8, Math.max(12, y)));
  };

  context.save();
  if (guide.vanishing_line.status === "visible") {
    context.strokeStyle = "rgba(100, 116, 139, .9)";
    context.lineWidth = 1;
    context.setLineDash([8, 6]);
    drawLine(...guide.vanishing_line.segment);
    context.setLineDash([]);
    const center = midpoint(...guide.vanishing_line.segment);
    label("平面消影线", [center[0] + 8, center[1] - 10], "#64748b");
  } else {
    label(guide.vanishing_line.status === "infinite" ?
      "平面消影线位于无穷远" : "平面消影线在画外", [12, height - 16], "#64748b");
  }

  guide.directions.forEach((direction, index) => {
    const color = colors[direction.family];
    const midpoints = edgePairs[direction.family].map(([first, second]) =>
      midpoint(quad[first], quad[second]));
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1.25;
    if (direction.status === "parallel") {
      midpoints.forEach((center) => {
        const start = clamp([
          center[0] - direction.direction[0] * 32,
          center[1] - direction.direction[1] * 32,
        ]);
        const end = clamp([
          center[0] + direction.direction[0] * 32,
          center[1] + direction.direction[1] * 32,
        ]);
        drawLine(start, end);
        drawArrow(end, direction.direction, color);
      });
      label(`${direction.family.toUpperCase()} 该方向近似平行`,
        [midpoints[0][0] + 8, midpoints[0][1] - 12], color);
      return;
    }

    const target = direction.status === "onscreen" ?
      direction.point : direction.edge_anchor;
    midpoints.forEach((start) => drawLine(start, target));
    if (direction.status === "onscreen") {
      context.beginPath();
      context.arc(...clamp(target), 5, 0, Math.PI * 2);
      context.fill();
      label(`V${index + 1}`, [target[0] + 9, target[1] - 10], color);
    } else {
      drawArrow(target, direction.direction, color);
      label(`V${index + 1} 画外约 ${direction.distance_diagonals.toFixed(1)}×`,
        [
          target[0] - direction.direction[0] * 94,
          target[1] - direction.direction[1] * 94,
        ],
        color);
    }
  });
  context.restore();
}
