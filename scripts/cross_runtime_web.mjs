import { blendComposite } from "../web/js/blending.js";
import { computeHomography } from "../web/js/geometry.js";

let source = "";
for await (const chunk of process.stdin) source += chunk;
const request = JSON.parse(source);

const homographies = request.homographies.map(({ source: from, destination }) =>
  computeHomography(from, destination));
const background = {
  width: request.background.width,
  height: request.background.height,
  data: new Uint8ClampedArray(request.background.data),
};
const asset = {
  width: request.asset.width,
  height: request.asset.height,
  data: new Uint8ClampedArray(request.asset.data),
};
const composite = blendComposite(
  background,
  asset,
  request.quad,
  request.options,
);

process.stdout.write(JSON.stringify({
  homographies,
  composite: Array.from(composite.data),
  width: composite.width,
  height: composite.height,
}));
