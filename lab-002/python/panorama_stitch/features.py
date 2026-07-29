"""ORB feature extraction and conservative adjacent-pair matching."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import cv2
import numpy as np

from .contracts import StitchOptions
from .errors import StitchError
from .io import resize_for_analysis


@dataclass(frozen=True)
class FeatureSet:
    """ORB observations expressed in original-image pixel coordinates."""

    points: np.ndarray
    descriptors: np.ndarray
    analysis_image: np.ndarray
    analysis_scale: float
    image_shape: tuple[int, int]


@dataclass(frozen=True)
class MatchResult:
    """Indices surviving KNN, ratio, and bidirectional consistency filters."""

    left_indices: np.ndarray
    right_indices: np.ndarray
    candidate_count: int
    ratio_match_count: int
    mutual_match_count: int
    pair_index: int
    pair_names: tuple[str, str] | None = None


def extract_features(
    image: np.ndarray,
    *,
    options: StitchOptions | None = None,
) -> FeatureSet:
    """Extract ORB features from a capped analysis image."""

    selected = options or StitchOptions()
    analysis, scale = resize_for_analysis(
        image,
        max_side=selected.analysis_max_side,
    )
    if analysis.ndim == 3:
        gray = cv2.cvtColor(analysis, cv2.COLOR_RGB2GRAY)
    else:
        gray = analysis
    orb = cv2.ORB_create(nfeatures=selected.max_features)
    keypoints, descriptors = orb.detectAndCompute(gray, None)
    if (
        descriptors is None
        or keypoints is None
        or len(keypoints) < selected.min_inliers
    ):
        raise StitchError(
            "LOW_TEXTURE",
            "Not enough stable texture was found; include more detailed scene content.",
        )
    points = np.asarray([point.pt for point in keypoints], dtype=np.float32)
    points /= scale
    return FeatureSet(
        points=points,
        descriptors=np.ascontiguousarray(descriptors, dtype=np.uint8),
        analysis_image=analysis,
        analysis_scale=scale,
        image_shape=(int(image.shape[0]), int(image.shape[1])),
    )


def _ratio_matches(
    query: np.ndarray,
    train: np.ndarray,
    ratio_threshold: float,
) -> tuple[int, dict[int, int]]:
    if len(query) == 0 or len(train) < 2:
        return 0, {}
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    candidates = matcher.knnMatch(query, train, k=2)
    accepted: dict[int, int] = {}
    for neighbors in candidates:
        if len(neighbors) != 2:
            continue
        best, second = neighbors
        if best.distance < ratio_threshold * second.distance:
            accepted[best.queryIdx] = best.trainIdx
    return len(candidates), accepted


def match_pair(
    left: FeatureSet,
    right: FeatureSet,
    *,
    options: StitchOptions | None = None,
    pair_index: int = 0,
    pair_names: Sequence[str] | None = None,
) -> MatchResult:
    """Match one ordered adjacent pair using ratio and mutual checks."""

    selected = options or StitchOptions()
    names = tuple(pair_names) if pair_names is not None else None
    if names is not None and len(names) != 2:
        raise ValueError("pair_names must contain exactly two names")
    candidate_count, forward = _ratio_matches(
        left.descriptors,
        right.descriptors,
        selected.ratio_threshold,
    )
    if len(forward) < selected.min_inliers:
        raise StitchError(
            "INSUFFICIENT_OVERLAP",
            (
                f"Only {len(forward)} distinctive matches survived; "
                "capture more overlap between adjacent images."
            ),
            pair_index=pair_index,
            pair_names=names,
        )
    _, reverse = _ratio_matches(
        right.descriptors,
        left.descriptors,
        selected.ratio_threshold,
    )
    mutual = sorted(
        (left_index, right_index)
        for left_index, right_index in forward.items()
        if reverse.get(right_index) == left_index
    )
    if len(mutual) < selected.min_inliers:
        raise StitchError(
            "AMBIGUOUS_MATCHES",
            (
                f"{len(mutual)} of {len(forward)} ratio matches were mutual; "
                "avoid repetitive patterns or change the viewpoint less."
            ),
            pair_index=pair_index,
            pair_names=names,
        )
    indices = np.asarray(mutual, dtype=np.int32)
    return MatchResult(
        left_indices=indices[:, 0],
        right_indices=indices[:, 1],
        candidate_count=candidate_count,
        ratio_match_count=len(forward),
        mutual_match_count=len(mutual),
        pair_index=pair_index,
        pair_names=names,
    )
