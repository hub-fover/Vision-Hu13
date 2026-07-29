import { stitchOptions } from "./contracts.js";
import { autoCrop } from "./crop.js";
import { StitchError } from "./errors.js";
import { composeTransforms } from "./geometry.js";
import { OpenCvAdapter } from "./opencv-adapter.js";
import { warningMessages } from "./state.js";

function selectedAdapter(adapter) {
  return adapter ?? new OpenCvAdapter(globalThis.cv);
}

function cancellationPoint(isCancelled) {
  if (isCancelled?.()) {
    throw new StitchError("CANCELLED", "Panorama stitching was cancelled.");
  }
}

export function extractFeatures(image, {
  adapter,
  options,
} = {}) {
  return selectedAdapter(adapter).extractFeatures(
    image,
    stitchOptions(options),
  );
}

export function matchPair(left, right, {
  adapter,
  options,
  pairIndex = 0,
  pairNames = null,
} = {}) {
  return selectedAdapter(adapter).matchPair(
    left,
    right,
    stitchOptions(options),
    { pairIndex, pairNames },
  );
}

export function estimateHomography(left, right, matches, {
  adapter,
  options,
} = {}) {
  return selectedAdapter(adapter).estimateHomography(
    left,
    right,
    matches,
    stitchOptions(options),
  );
}

export { composeTransforms };

export function warpImages(images, transforms, {
  adapter,
  options,
  quality = "mobile",
} = {}) {
  return selectedAdapter(adapter).warpImages(
    images,
    transforms,
    stitchOptions(options),
    quality,
  );
}

export function blendPanorama(warped, {
  adapter,
  options,
} = {}) {
  return selectedAdapter(adapter).blendPanorama(
    warped,
    stitchOptions(options),
  );
}

export { autoCrop };

function pairContext(index, names) {
  return {
    pairIndex: index,
    pairNames: [names[index], names[index + 1]],
  };
}

function addPairContext(error, index, names) {
  if (!(error instanceof StitchError) || error.pairIndex !== null) throw error;
  throw new StitchError(error.code, error.message, {
    ...pairContext(Math.min(Math.max(index - 1, 0), names.length - 2), names),
    cause: error,
  });
}

export async function stitchImages(sources, {
  adapter,
  options: overrides,
  quality = "mobile",
  isCancelled,
  onProgress = () => {},
} = {}) {
  if (sources.length < 2) {
    throw new StitchError(
      "NOT_ENOUGH_IMAGES",
      "Choose at least two ordered images with visible overlap.",
    );
  }
  const activeAdapter = selectedAdapter(adapter);
  const options = stitchOptions(overrides);
  const resources = [];
  const remember = (resource) => {
    resources.push(resource);
    return resource;
  };
  const names = sources.map((source, index) =>
    source.name || `image-${String(index + 1).padStart(2, "0")}`);
  try {
    cancellationPoint(isCancelled);
    const images = [];
    for (let index = 0; index < sources.length; index += 1) {
      images.push(remember(await activeAdapter.decode(sources[index])));
      onProgress({
        stage: "解码照片",
        progress: 0.05 + 0.1 * ((index + 1) / sources.length),
      });
      cancellationPoint(isCancelled);
    }
    const features = [];
    for (let index = 0; index < images.length; index += 1) {
      try {
        features.push(remember(activeAdapter.extractFeatures(
          images[index],
          options,
        )));
      } catch (error) {
        addPairContext(error, index, names);
      }
      onProgress({
        stage: "特征提取",
        progress: 0.15 + 0.2 * ((index + 1) / images.length),
      });
      cancellationPoint(isCancelled);
    }
    const matches = [];
    const homographies = [];
    for (let index = 0; index < images.length - 1; index += 1) {
      const context = pairContext(index, names);
      const pairMatches = remember(activeAdapter.matchPair(
        features[index],
        features[index + 1],
        options,
        context,
      ));
      matches.push(pairMatches);
      homographies.push(remember(activeAdapter.estimateHomography(
        features[index],
        features[index + 1],
        pairMatches,
        options,
      )));
      onProgress({
        stage: `配准第 ${index + 1} 组`,
        progress: 0.35 + 0.25 * ((index + 1) / (images.length - 1)),
      });
      cancellationPoint(isCancelled);
    }
    const transforms = composeTransforms(
      homographies.map(({ transform }) => transform),
      { imageCount: images.length },
    );
    const warped = remember(activeAdapter.warpImages(
      images,
      transforms,
      options,
      quality,
    ));
    onProgress({ stage: "透视变换", progress: 0.72 });
    cancellationPoint(isCancelled);
    const blended = remember(activeAdapter.blendPanorama(warped, options));
    onProgress({ stage: "曝光与接缝融合", progress: 0.86 });
    cancellationPoint(isCancelled);
    const crop = autoCrop(
      blended.validMask,
      warped.width,
      warped.height,
      { inset: 2 },
    );
    const cropped = remember(activeAdapter.crop(blended.image, crop));
    const [jpeg, seam] = await Promise.all([
      activeAdapter.encodeJpeg(cropped, options.jpegQuality),
      activeAdapter.encodeSeam?.(blended) ?? null,
    ]);
    onProgress({ stage: "JPEG 导出", progress: 1 });
    return {
      jpeg,
      seam,
      width: crop.width,
      height: crop.height,
      crop,
      matchMetrics: homographies.map(({ metrics }) => metrics),
      transforms,
      exposureGains: blended.exposureGains,
      warnings: warningMessages(images, options),
      estimatedWorkingSetMiB: warped.estimatedWorkingSetMiB,
    };
  } finally {
    for (let index = resources.length - 1; index >= 0; index -= 1) {
      activeAdapter.release(resources[index]);
    }
  }
}
