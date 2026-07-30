import { autoCrop } from "../web/js/crop.js";
import {
  applyHomography,
  composeTransforms,
  planCanvas,
} from "../web/js/geometry.js";
import { OpenCvAdapter } from "../web/js/opencv-adapter.js";

class AcceptanceMat {
  constructor(rows = 0, cols = 0) {
    this.rows = rows;
    this.cols = cols;
    this.data = new Uint8ClampedArray(rows * cols * 4);
    this.data32F = new Float32Array(rows * cols);
  }

  delete() {}
}

const cv = {
  Mat: AcceptanceMat,
  CV_8UC4: 0,
  DIST_L2: 0,
  distanceTransform(mask, distance) {
    distance.data32F = Float32Array.from(
      mask.data,
      (value) => value ? 1 : 0,
    );
  },
};

let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);

const transforms = composeTransforms(request.adjacentHomographies, {
  imageCount: request.imageCount,
});
const projectedControlPoints = transforms.map((transform, index) =>
  request.controlPoints[index].map((point) =>
    applyHomography(transform, point)));
const plans = Object.fromEntries(["mobile", "hd"].map((quality) => [
  quality,
  planCanvas(request.images, transforms, { quality }),
]));

const adapter = new OpenCvAdapter(cv);
const rgbaImages = request.color.images.map((rgb) => ({
  data: Uint8ClampedArray.from(rgb.flatMap((pixel) => [...pixel, 255])),
}));
const masks = request.color.masks.map((mask) => ({
  data: Uint8Array.from(mask),
}));
const blended = adapter.blendPanorama({
  images: rgbaImages,
  masks,
  width: request.color.width,
  height: request.color.height,
}, request.options);
const crop = autoCrop(
  Uint8Array.from(request.crop.mask),
  request.crop.width,
  request.crop.height,
);

process.stdout.write(JSON.stringify({
  transforms,
  projectedControlPoints,
  plans,
  blend: {
    image: Array.from(blended.image.data),
    validMask: Array.from(blended.validMask),
    seamMask: Array.from(blended.seamMask),
  },
  crop,
}));
