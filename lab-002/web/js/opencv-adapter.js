import { StitchError } from "./errors.js";
import {
  applyHomography,
  invert3,
  multiply3,
  planCanvas,
} from "./geometry.js";

export const MAX_EXPOSURE_SAMPLES = 65_536;

function median(values) {
  if (!values.length) return 0;
  const sorted = Float32Array.from(values);
  sorted.sort();
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ?
    sorted[middle] :
    (sorted[middle - 1] + sorted[middle]) / 2;
}

function deleteValue(value) {
  value?.delete?.();
}

function contextError(code, message, context) {
  return new StitchError(code, message, {
    pairIndex: context.pairIndex,
    pairNames: context.pairNames,
  });
}

export function sampleOverlapLuminance(
  previous,
  current,
  previousMask,
  currentMask,
  previousGain = 1,
) {
  const stride = Math.max(
    1,
    Math.ceil(currentMask.length / MAX_EXPOSURE_SAMPLES),
  );
  const capacity = Math.min(
    MAX_EXPOSURE_SAMPLES,
    Math.ceil(currentMask.length / stride),
  );
  const previousValues = new Float32Array(capacity);
  const currentValues = new Float32Array(capacity);
  let count = 0;
  for (
    let pixel = 0;
    pixel < currentMask.length && count < capacity;
    pixel += stride
  ) {
    if (!previousMask[pixel] || !currentMask[pixel]) continue;
    const offset = pixel * 4;
    previousValues[count] = (
      previous[offset] * 0.2126 +
      previous[offset + 1] * 0.7152 +
      previous[offset + 2] * 0.0722
    ) * previousGain;
    currentValues[count] =
      current[offset] * 0.2126 +
      current[offset + 1] * 0.7152 +
      current[offset + 2] * 0.0722;
    count += 1;
  }
  return {
    previous: previousValues.subarray(0, count),
    current: currentValues.subarray(0, count),
  };
}

export class OpenCvAdapter {
  constructor(cv) {
    if (!cv?.Mat) {
      throw new StitchError(
        "DECODE_FAILED",
        "OpenCV.js has not finished loading.",
      );
    }
    this.cv = cv;
  }

  async decode(source) {
    const { cv } = this;
    if (source?.mat) return source;
    if (!source?.bitmap) {
      throw new StitchError("DECODE_FAILED", "Image bitmap is missing.");
    }
    const width = source.bitmap.width;
    const height = source.bitmap.height;
    try {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", {
        alpha: false,
        willReadFrequently: true,
      });
      context.drawImage(source.bitmap, 0, 0);
      const imageData = context.getImageData(0, 0, width, height);
      return {
        name: source.name,
        width,
        height,
        mat: cv.matFromImageData(imageData),
      };
    } catch (error) {
      throw new StitchError(
        "DECODE_FAILED",
        `Could not decode ${source.name || "image"}.`,
        { cause: error },
      );
    } finally {
      source.bitmap.close();
    }
  }

  extractFeatures(image, options) {
    const { cv } = this;
    const scale = Math.min(
      1,
      options.analysisMaxSide / Math.max(image.width, image.height),
    );
    const gray = new cv.Mat();
    const analysis = new cv.Mat();
    const mask = new cv.Mat();
    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();
    const orb = cv.ORB.create(options.maxFeatures);
    try {
      cv.cvtColor(image.mat, gray, cv.COLOR_RGBA2GRAY);
      if (scale < 1) {
        cv.resize(
          gray,
          analysis,
          new cv.Size(
            Math.max(1, Math.round(image.width * scale)),
            Math.max(1, Math.round(image.height * scale)),
          ),
          0,
          0,
          cv.INTER_AREA,
        );
      } else {
        gray.copyTo(analysis);
      }
      orb.detectAndCompute(analysis, mask, keypoints, descriptors);
      if (keypoints.size() < options.minInliers || descriptors.empty()) {
        throw new StitchError(
          "LOW_TEXTURE",
          "Not enough stable texture was found.",
        );
      }
      const points = [];
      for (let index = 0; index < keypoints.size(); index += 1) {
        const point = keypoints.get(index).pt;
        points.push([point.x / scale, point.y / scale]);
      }
      return {
        points,
        descriptors: descriptors.clone(),
        analysisScale: scale,
        imageShape: [image.height, image.width],
      };
    } finally {
      deleteValue(orb);
      deleteValue(keypoints);
      deleteValue(mask);
      deleteValue(analysis);
      deleteValue(gray);
      deleteValue(descriptors);
    }
  }

  ratioMatches(query, train, threshold) {
    const { cv } = this;
    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
    const matches = new cv.DMatchVectorVector();
    const accepted = new Map();
    try {
      matcher.knnMatch(query, train, matches, 2);
      for (let index = 0; index < matches.size(); index += 1) {
        const neighbors = matches.get(index);
        try {
          if (neighbors.size() !== 2) continue;
          const best = neighbors.get(0);
          const second = neighbors.get(1);
          if (best.distance < threshold * second.distance) {
            accepted.set(best.queryIdx, best.trainIdx);
          }
        } finally {
          deleteValue(neighbors);
        }
      }
      return { candidateCount: matches.size(), accepted };
    } finally {
      deleteValue(matches);
      deleteValue(matcher);
    }
  }

  matchPair(left, right, options, context) {
    const forward = this.ratioMatches(
      left.descriptors,
      right.descriptors,
      options.ratioThreshold,
    );
    if (forward.accepted.size < options.minInliers) {
      throw contextError(
        "INSUFFICIENT_OVERLAP",
        `Only ${forward.accepted.size} ratio matches survived.`,
        context,
      );
    }
    const reverse = this.ratioMatches(
      right.descriptors,
      left.descriptors,
      options.ratioThreshold,
    );
    const pairs = [...forward.accepted]
      .filter(([leftIndex, rightIndex]) =>
        reverse.accepted.get(rightIndex) === leftIndex)
      .sort(([leftIndex], [otherLeft]) => leftIndex - otherLeft);
    if (pairs.length < options.minInliers) {
      throw contextError(
        "AMBIGUOUS_MATCHES",
        `Only ${pairs.length} mutual matches survived.`,
        context,
      );
    }
    return {
      pairs,
      candidateCount: forward.candidateCount,
      ratioMatchCount: forward.accepted.size,
      mutualMatchCount: pairs.length,
      ...context,
    };
  }

  estimateHomography(left, right, matches, options) {
    const { cv } = this;
    const sourceData = [];
    const targetData = [];
    for (const [leftIndex, rightIndex] of matches.pairs) {
      sourceData.push(
        left.points[leftIndex][0] * left.analysisScale,
        left.points[leftIndex][1] * left.analysisScale,
      );
      targetData.push(
        right.points[rightIndex][0] * right.analysisScale,
        right.points[rightIndex][1] * right.analysisScale,
      );
    }
    const source = cv.matFromArray(
      matches.pairs.length,
      1,
      cv.CV_32FC2,
      sourceData,
    );
    const target = cv.matFromArray(
      matches.pairs.length,
      1,
      cv.CV_32FC2,
      targetData,
    );
    const inlierMask = new cv.Mat();
    let homography;
    try {
      homography = cv.findHomography(
        source,
        target,
        cv.RANSAC,
        options.ransacThresholdPx,
        inlierMask,
      );
      if (!homography || homography.empty()) {
        throw contextError(
          "HOMOGRAPHY_UNSTABLE",
          "RANSAC did not return a transform.",
          matches,
        );
      }
      const analysisTransform = Array.from(
        homography.data64F?.length ? homography.data64F : homography.data32F,
      );
      const leftScale = [
        left.analysisScale, 0, 0,
        0, left.analysisScale, 0,
        0, 0, 1,
      ];
      const rightScaleInverse = [
        1 / right.analysisScale, 0, 0,
        0, 1 / right.analysisScale, 0,
        0, 0, 1,
      ];
      const transform = multiply3(
        rightScaleInverse,
        multiply3(analysisTransform, leftScale),
      );
      const inverse = invert3(transform);
      const norm = (matrix) => Math.max(
        Math.abs(matrix[0]) + Math.abs(matrix[1]) + Math.abs(matrix[2]),
        Math.abs(matrix[3]) + Math.abs(matrix[4]) + Math.abs(matrix[5]),
        Math.abs(matrix[6]) + Math.abs(matrix[7]) + Math.abs(matrix[8]),
      );
      if (norm(transform) * norm(inverse) > 1e8) {
        throw contextError(
          "HOMOGRAPHY_UNSTABLE",
          "The homography condition number is unstable.",
          matches,
        );
      }
      const [height, width] = left.imageShape;
      const corners = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ].map((point) => applyHomography(transform, point));
      if (corners.flat().some((value) =>
        !Number.isFinite(value) || Math.abs(value) > 32 * Math.max(width, height))) {
        throw contextError(
          "HOMOGRAPHY_UNSTABLE",
          "Transformed bounds are implausible.",
          matches,
        );
      }
      const mask = inlierMask.data;
      const errors = [];
      let inlierCount = 0;
      for (let index = 0; index < matches.pairs.length; index += 1) {
        if (!mask[index]) continue;
        inlierCount += 1;
        const projected = applyHomography(analysisTransform, [
          sourceData[index * 2],
          sourceData[index * 2 + 1],
        ]);
        errors.push(Math.hypot(
          projected[0] - targetData[index * 2],
          projected[1] - targetData[index * 2 + 1],
        ));
      }
      const inlierRatio = inlierCount / matches.pairs.length;
      if (
        inlierCount < options.minInliers ||
        inlierRatio < options.minInlierRatio
      ) {
        throw contextError(
          "INSUFFICIENT_OVERLAP",
          `RANSAC retained ${inlierCount} inliers.`,
          matches,
        );
      }
      const medianReprojectionErrorPx = median(errors);
      if (medianReprojectionErrorPx > options.maxMedianErrorPx) {
        throw contextError(
          "HIGH_REPROJECTION_ERROR",
          `Median error is ${medianReprojectionErrorPx.toFixed(2)}px.`,
          matches,
        );
      }
      return {
        transform,
        metrics: {
          pairIndex: matches.pairIndex,
          candidateCount: matches.candidateCount,
          ratioMatchCount: matches.ratioMatchCount,
          mutualMatchCount: matches.mutualMatchCount,
          inlierCount,
          inlierRatio,
          medianReprojectionErrorPx,
        },
      };
    } catch (error) {
      if (error instanceof StitchError && error.pairIndex === null) {
        throw contextError(error.code, error.message, matches);
      }
      throw error;
    } finally {
      deleteValue(homography);
      deleteValue(inlierMask);
      deleteValue(target);
      deleteValue(source);
    }
  }

  warpImages(images, transforms, options, quality) {
    const { cv } = this;
    const plan = planCanvas(images, transforms, { ...options, quality });
    const warpedImages = [];
    const masks = [];
    try {
      for (let index = 0; index < images.length; index += 1) {
        const matrix = cv.matFromArray(
          3,
          3,
          cv.CV_64F,
          plan.transforms[index],
        );
        const warped = new cv.Mat();
        const sourceMask = new cv.Mat(
          images[index].height,
          images[index].width,
          cv.CV_8UC1,
          new cv.Scalar(255),
        );
        const mask = new cv.Mat();
        try {
          cv.warpPerspective(
            images[index].mat,
            warped,
            matrix,
            new cv.Size(plan.width, plan.height),
            cv.INTER_LINEAR,
            cv.BORDER_CONSTANT,
            new cv.Scalar(0, 0, 0, 0),
          );
          cv.warpPerspective(
            sourceMask,
            mask,
            matrix,
            new cv.Size(plan.width, plan.height),
            cv.INTER_NEAREST,
            cv.BORDER_CONSTANT,
            new cv.Scalar(0),
          );
          warpedImages.push(warped);
          masks.push(mask);
        } catch (error) {
          deleteValue(warped);
          deleteValue(mask);
          throw error;
        } finally {
          deleteValue(sourceMask);
          deleteValue(matrix);
        }
      }
      return {
        images: warpedImages,
        masks,
        width: plan.width,
        height: plan.height,
        outputScale: plan.outputScale,
        estimatedWorkingSetMiB: plan.estimatedWorkingSetMiB,
      };
    } catch (error) {
      warpedImages.forEach(deleteValue);
      masks.forEach(deleteValue);
      throw error;
    }
  }

  exposureGains(images, masks, options) {
    const gains = [1];
    for (let index = 1; index < images.length; index += 1) {
      const samples = sampleOverlapLuminance(
        images[index - 1].data,
        images[index].data,
        masks[index - 1].data,
        masks[index].data,
        gains[index - 1],
      );
      const denominator = median(samples.current);
      const gain = denominator > 1e-6 ?
        median(samples.previous) / denominator :
        1;
      gains.push(Math.max(
        options.exposureGain.min,
        Math.min(options.exposureGain.max, gain),
      ));
    }
    return gains;
  }

  blendPanorama(warped, options) {
    const { cv } = this;
    const pixels = warped.width * warped.height;
    const accumulator = new Float32Array(pixels * 3);
    const weightSum = new Float32Array(pixels);
    const coverage = new Uint8Array(pixels);
    const exposureGains = this.exposureGains(
      warped.images,
      warped.masks,
      options,
    );
    for (let index = 0; index < warped.images.length; index += 1) {
      const distance = new cv.Mat();
      try {
        cv.distanceTransform(
          warped.masks[index],
          distance,
          cv.DIST_L2,
          3,
        );
        const image = warped.images[index].data;
        const mask = warped.masks[index].data;
        const distances = distance.data32F;
        for (let pixel = 0; pixel < pixels; pixel += 1) {
          if (!mask[pixel]) continue;
          coverage[pixel] += 1;
          const weight = Math.min(
            distances[pixel] / Math.max(1, options.blendWidthPx),
            1,
          );
          weightSum[pixel] += weight;
          const sourceOffset = pixel * 4;
          const targetOffset = pixel * 3;
          accumulator[targetOffset] +=
            image[sourceOffset] * exposureGains[index] * weight;
          accumulator[targetOffset + 1] +=
            image[sourceOffset + 1] * exposureGains[index] * weight;
          accumulator[targetOffset + 2] +=
            image[sourceOffset + 2] * exposureGains[index] * weight;
        }
      } finally {
        deleteValue(distance);
      }
    }
    const output = new cv.Mat(warped.height, warped.width, cv.CV_8UC4);
    const validMask = new Uint8Array(pixels);
    const seamMask = new Uint8Array(pixels);
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const target = pixel * 4;
      if (weightSum[pixel] > 0) {
        const source = pixel * 3;
        output.data[target] = Math.min(
          255,
          accumulator[source] / weightSum[pixel],
        );
        output.data[target + 1] = Math.min(
          255,
          accumulator[source + 1] / weightSum[pixel],
        );
        output.data[target + 2] = Math.min(
          255,
          accumulator[source + 2] / weightSum[pixel],
        );
        output.data[target + 3] = 255;
        validMask[pixel] = 255;
      }
      if (coverage[pixel] > 1) seamMask[pixel] = 255;
    }
    return { image: output, validMask, seamMask, exposureGains };
  }

  crop(image, crop) {
    const region = image.roi(new this.cv.Rect(
      crop.x,
      crop.y,
      crop.width,
      crop.height,
    ));
    const output = new this.cv.Mat();
    try {
      region.copyTo(output);
      return output;
    } catch (error) {
      deleteValue(output);
      throw error;
    } finally {
      deleteValue(region);
    }
  }

  async matToBlob(image, type, quality) {
    const canvas = new OffscreenCanvas(image.cols, image.rows);
    const context = canvas.getContext("2d");
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(image.data),
        image.cols,
        image.rows,
      ),
      0,
      0,
    );
    return canvas.convertToBlob({ type, quality });
  }

  encodeJpeg(image, quality) {
    return this.matToBlob(image, "image/jpeg", quality);
  }

  encodeSeam(blended) {
    const overlay = blended.image.clone();
    try {
      for (let pixel = 0; pixel < blended.seamMask.length; pixel += 1) {
        if (!blended.seamMask[pixel]) continue;
        const offset = pixel * 4;
        overlay.data[offset] =
          Math.round(overlay.data[offset] * 0.45 + 255 * 0.55);
        overlay.data[offset + 1] =
          Math.round(overlay.data[offset + 1] * 0.45);
        overlay.data[offset + 2] =
          Math.round(overlay.data[offset + 2] * 0.45 + 122 * 0.55);
      }
      return this.matToBlob(overlay, "image/png");
    } finally {
      deleteValue(overlay);
    }
  }

  release(value) {
    if (!value) return;
    if (typeof value.delete === "function") {
      value.delete();
      return;
    }
    if (value.mat) deleteValue(value.mat);
    if (value.descriptors) deleteValue(value.descriptors);
    value.images?.forEach(deleteValue);
    value.masks?.forEach(deleteValue);
    if (value.image && typeof value.image.delete === "function") {
      value.image.delete();
    }
  }
}
