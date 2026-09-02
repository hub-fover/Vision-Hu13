"""Feature-based affine alignment against the middle exposure."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import cv2
import numpy as np

from .contracts import AlignmentMetrics, FusionOptions
from .errors import FusionError


@dataclass(frozen=True)
class AlignmentResult:
    images: tuple[np.ndarray, np.ndarray, np.ndarray]
    masks: tuple[np.ndarray, np.ndarray, np.ndarray]
    transforms: tuple[np.ndarray, np.ndarray, np.ndarray]
    metrics: tuple[AlignmentMetrics, AlignmentMetrics]


def _analysis_gray(image: np.ndarray, max_side: int) -> tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    scale = min(1.0, max_side / max(height, width))
    if scale < 1:
        image = cv2.resize(
            image,
            (round(width * scale), round(height * scale)),
            interpolation=cv2.INTER_AREA,
        )
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    return cv2.equalizeHist(gray), scale


def _features(image: np.ndarray, options: FusionOptions):
    gray, scale = _analysis_gray(image, options.analysis_max_side)
    keypoints, descriptors = cv2.ORB_create(nfeatures=options.orb_features).detectAndCompute(gray, None)
    if descriptors is None or len(keypoints) < options.min_inliers:
        raise FusionError("LOW_TEXTURE", "The scene does not contain enough stable detail.")
    points = np.asarray([point.pt for point in keypoints], dtype=np.float32)
    return points, descriptors, scale


def _mutual_matches(left: np.ndarray, right: np.ndarray, ratio: float):
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)

    def accepted(query, train):
        result = {}
        for neighbors in matcher.knnMatch(query, train, k=2):
            if len(neighbors) == 2 and neighbors[0].distance < ratio * neighbors[1].distance:
                result[neighbors[0].queryIdx] = neighbors[0].trainIdx
        return result

    forward = accepted(left, right)
    reverse = accepted(right, left)
    pairs = [(a, b) for a, b in forward.items() if reverse.get(b) == a]
    return len(forward), pairs


def _align_one(
    source: np.ndarray,
    reference: np.ndarray,
    source_index: int,
    options: FusionOptions,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, AlignmentMetrics]:
    source_points, source_desc, source_scale = _features(source, options)
    ref_points, ref_desc, ref_scale = _features(reference, options)
    candidate_count, pairs = _mutual_matches(source_desc, ref_desc, options.ratio_threshold)
    if len(pairs) < options.min_inliers:
        raise FusionError("ALIGNMENT_FAILED", "Too few exposure-invariant matches survived.")
    source_fit = np.asarray([source_points[a] for a, _ in pairs], dtype=np.float32)
    ref_fit = np.asarray([ref_points[b] for _, b in pairs], dtype=np.float32)
    matrix, inlier_mask = cv2.estimateAffinePartial2D(
        source_fit,
        ref_fit,
        method=cv2.RANSAC,
        ransacReprojThreshold=3.0,
        maxIters=3000,
        confidence=0.995,
        refineIters=10,
    )
    if matrix is None or inlier_mask is None:
        raise FusionError("ALIGNMENT_FAILED", "RANSAC could not estimate a stable transform.")
    inliers = inlier_mask.ravel().astype(bool)
    inlier_count = int(np.count_nonzero(inliers))
    inlier_ratio = inlier_count / len(pairs)
    predicted = cv2.transform(source_fit[None, :, :], matrix)[0]
    errors = np.linalg.norm(predicted - ref_fit, axis=1)[inliers]
    median_error = float(np.median(errors)) if errors.size else float("inf")
    if (
        inlier_count < options.min_inliers
        or inlier_ratio < options.min_inlier_ratio
        or median_error > options.max_median_reprojection_error_px
    ):
        raise FusionError("ALIGNMENT_FAILED", "The exposure alignment did not pass its quality gates.")

    analysis = np.vstack([matrix, [0.0, 0.0, 1.0]])
    source_scale_matrix = np.diag([source_scale, source_scale, 1.0])
    ref_scale_inverse = np.diag([1 / ref_scale, 1 / ref_scale, 1.0])
    full = ref_scale_inverse @ analysis @ source_scale_matrix
    scale = float(np.hypot(full[0, 0], full[1, 0]))
    rotation = float(np.degrees(np.arctan2(full[1, 0], full[0, 0])))
    translation = float(np.hypot(full[0, 2], full[1, 2]))
    if not (0.95 <= scale <= 1.05) or abs(rotation) > 5 or translation > 0.10 * max(reference.shape[:2]):
        raise FusionError("SCENE_MISMATCH", "The compositions differ too much for a hand-held bracket.")
    height, width = reference.shape[:2]
    affine = full[:2]
    aligned = cv2.warpAffine(
        source,
        affine,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
    )
    mask = cv2.warpAffine(
        np.full(source.shape[:2], 255, dtype=np.uint8),
        affine,
        (width, height),
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
    )
    metrics = AlignmentMetrics(
        source_index=source_index,
        reference_index=1,
        candidate_count=candidate_count,
        mutual_match_count=len(pairs),
        inlier_count=inlier_count,
        inlier_ratio=float(inlier_ratio),
        median_reprojection_error_px=median_error,
        translation_px=translation,
        rotation_degrees=rotation,
        scale=scale,
    )
    return aligned, mask, full, metrics


def align_exposures(images: Sequence[np.ndarray], options: FusionOptions | None = None) -> AlignmentResult:
    selected = options or FusionOptions()
    if len(images) != 3:
        raise FusionError("INVALID_IMAGE_COUNT", "Choose exactly three exposures.")
    reference = images[1]
    base_height, base_width = reference.shape[:2]
    for image in images:
        ratio = image.shape[1] / image.shape[0]
        base_ratio = base_width / base_height
        if abs(ratio / base_ratio - 1) > 0.02:
            raise FusionError("SCENE_MISMATCH", "The three photos have different aspect ratios.")
    dark, dark_mask, dark_transform, dark_metrics = _align_one(images[0], reference, 0, selected)
    bright, bright_mask, bright_transform, bright_metrics = _align_one(images[2], reference, 2, selected)
    identity = np.eye(3, dtype=np.float64)
    reference_mask = np.full(reference.shape[:2], 255, dtype=np.uint8)
    return AlignmentResult(
        images=(dark, reference.copy(), bright),
        masks=(dark_mask, reference_mask, bright_mask),
        transforms=(dark_transform, identity, bright_transform),
        metrics=(dark_metrics, bright_metrics),
    )
