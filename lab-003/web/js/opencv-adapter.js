import { FusionError } from "./errors.js";
import { estimateSimilarityRansac, validateAlignment } from "./alignment.js";

function release(value) { value?.delete?.(); }

export class OpenCvAdapter {
  constructor(cv) {
    if (!cv?.Mat) throw new FusionError("DECODE_FAILED", "OpenCV.js is not ready.");
    this.cv = cv;
  }

  extractFeatures(image, options) {
    const { cv } = this;
    const rgba = cv.matFromImageData(new ImageData(image.data, image.width, image.height));
    const gray = new cv.Mat();
    const analysis = new cv.Mat();
    const equalized = new cv.Mat();
    const mask = new cv.Mat();
    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();
    const orb = cv.ORB.create(options.orbFeatures);
    const scale = Math.min(1, options.analysisMaxSide / Math.max(image.width, image.height));
    try {
      cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
      if (scale < 1) cv.resize(gray, analysis, new cv.Size(Math.round(image.width * scale), Math.round(image.height * scale)), 0, 0, cv.INTER_AREA);
      else gray.copyTo(analysis);
      cv.equalizeHist(analysis, equalized);
      orb.detectAndCompute(equalized, mask, keypoints, descriptors);
      if (keypoints.size() < options.minInliers || descriptors.empty()) {
        throw new FusionError("LOW_TEXTURE", "The scene does not contain enough stable detail.");
      }
      const points = [];
      for (let index = 0; index < keypoints.size(); index += 1) {
        const point = keypoints.get(index).pt;
        points.push([point.x / scale, point.y / scale]);
      }
      return { points, descriptors: descriptors.clone() };
    } finally {
      [orb, keypoints, mask, equalized, analysis, gray, rgba, descriptors].forEach(release);
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
          if (best.distance < threshold * second.distance) accepted.set(best.queryIdx, best.trainIdx);
        } finally { release(neighbors); }
      }
      return accepted;
    } finally { release(matches); release(matcher); }
  }

  alignPair(source, reference, options) {
    const sourceFeatures = this.extractFeatures(source, options);
    const referenceFeatures = this.extractFeatures(reference, options);
    try {
      const forward = this.ratioMatches(sourceFeatures.descriptors, referenceFeatures.descriptors, options.ratioThreshold);
      const reverse = this.ratioMatches(referenceFeatures.descriptors, sourceFeatures.descriptors, options.ratioThreshold);
      const pairs = [...forward].filter(([left, right]) => reverse.get(right) === left).sort((a, b) => a[0] - b[0]);
      if (pairs.length < options.minInliers) {
        throw new FusionError("SCENE_MISMATCH", "The exposures do not appear to show the same scene.");
      }
      const sourcePoints = pairs.map(([index]) => sourceFeatures.points[index]);
      const targetPoints = pairs.map(([, index]) => referenceFeatures.points[index]);
      return validateAlignment(estimateSimilarityRansac(sourcePoints, targetPoints), source.width, source.height, options);
    } finally { release(sourceFeatures.descriptors); release(referenceFeatures.descriptors); }
  }

  warp(image, matrix, width, height) {
    const { cv } = this;
    const source = cv.matFromImageData(new ImageData(image.data, image.width, image.height));
    const transform = cv.matFromArray(2, 3, cv.CV_64F, matrix);
    const output = new cv.Mat();
    const sourceMask = new cv.Mat(image.height, image.width, cv.CV_8UC1, new cv.Scalar(255));
    const outputMask = new cv.Mat();
    try {
      cv.warpAffine(source, output, transform, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
      cv.warpAffine(sourceMask, outputMask, transform, new cv.Size(width, height), cv.INTER_NEAREST, cv.BORDER_CONSTANT, new cv.Scalar(0));
      return {
        image: { width, height, data: new Uint8ClampedArray(output.data) },
        mask: new Uint8Array(outputMask.data),
      };
    } finally { [outputMask, sourceMask, output, transform, source].forEach(release); }
  }
}
