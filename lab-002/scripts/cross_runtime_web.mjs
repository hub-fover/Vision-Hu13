import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { autoCrop } from "../web/js/crop.js";
import {
  applyHomography,
  composeTransforms,
  planCanvas,
} from "../web/js/geometry.js";
import { OpenCvAdapter } from "../web/js/opencv-adapter.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const opencvPackageDirectory = resolve(
  scriptDirectory,
  "../web/node_modules/@techstark/opencv-js",
);
const opencvPackage = JSON.parse(
  await readFile(resolve(opencvPackageDirectory, "package.json"), "utf8"),
);
const require = createRequire(import.meta.url);
const cv = require(resolve(opencvPackageDirectory, "dist/opencv.js"));

async function realOpenCv() {
  if (cv.Mat) return { module: cv };
  const ready = await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Real OpenCV.js initialization timed out.")),
      30_000,
    );
    cv.onRuntimeInitialized = () => {
      clearTimeout(timeout);
      // Wrap the Emscripten thenable so Promise resolution does not assimilate
      // cv.then and wait forever in Node.
      resolveReady({ module: cv });
    };
  });
  return ready;
}

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
const boundary = request.budgetBoundary;
const boundaryPlan = (scenario, quality = "mobile") => {
  const plan = planCanvas(
    scenario.images,
    scenario.transforms,
    { ...scenario.options, quality },
  );
  return {
    outputScale: plan.outputScale,
    outputMegapixels: plan.width * plan.height / 1_000_000,
    estimatedWorkingSetMiB: plan.estimatedWorkingSetMiB,
  };
};
const outputCaps = Object.fromEntries(["mobile", "hd"].map((quality) => [
  quality,
  boundaryPlan(boundary.outputCap, quality),
]));
const memoryPressure = boundaryPlan(boundary.memoryPressure);
let overLimitRejected = false;
try {
  boundaryPlan(boundary.overLimit);
} catch (error) {
  if (error?.code !== "OUTPUT_TOO_LARGE") throw error;
  overLimitRejected = true;
}

const { module: realCv } = await realOpenCv();
const adapter = new OpenCvAdapter(realCv);
const rgbaImages = request.color.images.map((rgb) => {
  const image = new cv.Mat(
    request.color.height,
    request.color.width,
    cv.CV_8UC4,
  );
  image.data.set(Uint8Array.from(
    rgb.flatMap((pixel) => [...pixel, 255]),
  ));
  return image;
});
const masks = request.color.masks.map((values) => {
  const mask = new cv.Mat(
    request.color.height,
    request.color.width,
    cv.CV_8UC1,
  );
  mask.data.set(Uint8Array.from(values));
  return mask;
});
const blended = adapter.blendPanorama({
  images: rgbaImages,
  masks,
  width: request.color.width,
  height: request.color.height,
}, request.options);
const blend = {
  image: Array.from(blended.image.data),
  validMask: Array.from(blended.validMask),
  seamMask: Array.from(blended.seamMask),
};
blended.image.delete();
rgbaImages.forEach((image) => image.delete());
masks.forEach((mask) => mask.delete());
const crop = autoCrop(
  Uint8Array.from(request.crop.mask),
  request.crop.width,
  request.crop.height,
);

process.stdout.write(JSON.stringify({
  transforms,
  projectedControlPoints,
  plans,
  budgetBoundary: {
    outputCaps,
    memoryPressure,
    overLimitRejected,
  },
  opencvRuntime: {
    package: opencvPackage.name,
    version: opencvPackage.version,
    realMat: typeof realCv.Mat === "function",
    distanceTransform: typeof realCv.distanceTransform === "function",
  },
  blend,
  crop,
}));
