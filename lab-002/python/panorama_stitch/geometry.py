"""RANSAC quality gates and middle-anchor transform composition."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .contracts import MatchMetrics, StitchOptions
from .errors import StitchError
from .features import FeatureSet, MatchResult


@dataclass(frozen=True)
class HomographyResult:
    """An accepted left-to-right homography and its measured evidence."""

    transform: np.ndarray
    inlier_mask: np.ndarray
    metrics: MatchMetrics


def _pair_error(
    code: str,
    message: str,
    matches: MatchResult,
) -> StitchError:
    return StitchError(
        code,
        message,
        pair_index=matches.pair_index,
        pair_names=matches.pair_names,
    )


def _validate_homography_bounds(
    transform: np.ndarray,
    image_shape: tuple[int, int],
    matches: MatchResult,
) -> None:
    height, width = image_shape
    corners = np.asarray(
        [[[0, 0], [width, 0], [width, height], [0, height]]],
        dtype=np.float32,
    )
    transformed = cv2.perspectiveTransform(corners, transform)[0]
    base = max(height, width)
    extent = np.ptp(transformed, axis=0)
    if (
        not np.isfinite(transformed).all()
        or np.max(np.abs(transformed)) > 32 * base
        or np.max(extent) > 32 * base
        or np.min(extent) < 1 / 32
    ):
        raise _pair_error(
            "HOMOGRAPHY_UNSTABLE",
            "The transformed image bounds are implausible; retake the pair with steadier overlap.",
            matches,
        )


def estimate_homography(
    left: FeatureSet,
    right: FeatureSet,
    matches: MatchResult,
    *,
    options: StitchOptions | None = None,
) -> HomographyResult:
    """Estimate and validate a left-to-right adjacent homography."""

    selected = options or StitchOptions()
    source_original = left.points[matches.left_indices]
    target_original = right.points[matches.right_indices]
    source = source_original * left.analysis_scale
    target = target_original * right.analysis_scale
    if len(source) < max(4, selected.min_inliers):
        raise _pair_error(
            "INSUFFICIENT_OVERLAP",
            "Too few mutual matches remain for a stable homography.",
            matches,
        )
    analysis_transform, mask = cv2.findHomography(
        source,
        target,
        method=cv2.RANSAC,
        ransacReprojThreshold=selected.ransac_threshold_px,
    )
    if (
        analysis_transform is None
        or mask is None
        or not np.isfinite(analysis_transform).all()
    ):
        raise _pair_error(
            "HOMOGRAPHY_UNSTABLE",
            "RANSAC could not estimate a stable transform; avoid a flat or collinear scene.",
            matches,
        )
    if abs(analysis_transform[2, 2]) < 1e-12:
        raise _pair_error(
            "HOMOGRAPHY_UNSTABLE",
            "The homography normalization is singular.",
            matches,
        )
    analysis_transform = np.asarray(
        analysis_transform / analysis_transform[2, 2],
        dtype=np.float64,
    )
    condition = float(np.linalg.cond(analysis_transform))
    if not np.isfinite(condition) or condition > 1e8:
        raise _pair_error(
            "HOMOGRAPHY_UNSTABLE",
            f"The homography condition number ({condition:.2g}) is unstable.",
            matches,
        )
    left_scale = np.diag([left.analysis_scale, left.analysis_scale, 1.0])
    right_scale_inverse = np.diag(
        [1 / right.analysis_scale, 1 / right.analysis_scale, 1.0]
    )
    transform = right_scale_inverse @ analysis_transform @ left_scale
    transform /= transform[2, 2]
    _validate_homography_bounds(transform, left.image_shape, matches)
    inliers = mask.reshape(-1).astype(bool)
    inlier_count = int(np.count_nonzero(inliers))
    inlier_ratio = inlier_count / len(source)
    if (
        inlier_count < selected.min_inliers
        or inlier_ratio < selected.min_inlier_ratio
    ):
        raise _pair_error(
            "INSUFFICIENT_OVERLAP",
            (
                f"RANSAC kept {inlier_count}/{len(source)} inliers "
                f"({inlier_ratio:.0%}); capture more overlap."
            ),
            matches,
        )
    projected = cv2.perspectiveTransform(
        source.reshape(1, -1, 2),
        analysis_transform,
    )[0]
    errors = np.linalg.norm(projected - target, axis=1)
    median_error = float(np.median(errors[inliers]))
    if median_error > selected.max_median_error_px:
        raise _pair_error(
            "HIGH_REPROJECTION_ERROR",
            (
                f"Median inlier reprojection error is {median_error:.2f}px; "
                "rotate around one viewpoint and keep the camera level."
            ),
            matches,
        )
    metrics = MatchMetrics(
        pair_index=matches.pair_index,
        candidate_count=matches.candidate_count,
        ratio_match_count=matches.ratio_match_count,
        mutual_match_count=matches.mutual_match_count,
        inlier_count=inlier_count,
        inlier_ratio=inlier_ratio,
        median_reprojection_error_px=median_error,
    )
    return HomographyResult(
        transform=transform,
        inlier_mask=inliers,
        metrics=metrics,
    )


def compose_transforms(
    adjacent_homographies: list[np.ndarray] | tuple[np.ndarray, ...],
    *,
    image_count: int | None = None,
    anchor_index: int | None = None,
) -> list[np.ndarray]:
    """Compose adjacent left-to-right transforms around the middle image."""

    count = image_count if image_count is not None else len(adjacent_homographies) + 1
    if count < 1 or len(adjacent_homographies) != count - 1:
        raise ValueError("image_count must be one greater than adjacent homographies")
    anchor = count // 2 if anchor_index is None else anchor_index
    if not 0 <= anchor < count:
        raise ValueError("anchor_index is outside the image sequence")
    transforms = [np.eye(3, dtype=np.float64) for _ in range(count)]
    for index in range(anchor - 1, -1, -1):
        transforms[index] = transforms[index + 1] @ np.asarray(
            adjacent_homographies[index],
            dtype=np.float64,
        )
        transforms[index] /= transforms[index][2, 2]
    for index in range(anchor + 1, count):
        try:
            inverse = np.linalg.inv(
                np.asarray(adjacent_homographies[index - 1], dtype=np.float64)
            )
        except np.linalg.LinAlgError as error:
            raise StitchError(
                "HOMOGRAPHY_UNSTABLE",
                f"Adjacent transform {index} is singular.",
            ) from error
        transforms[index] = transforms[index - 1] @ inverse
        transforms[index] /= transforms[index][2, 2]
    return transforms
