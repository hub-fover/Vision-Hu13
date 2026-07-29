"""Debug exports drawn only from actual pipeline inputs and measurements."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
from PIL import Image

from .features import FeatureSet, MatchResult
from .geometry import HomographyResult
from .render import BlendResult, WarpResult


def _save_rgb(path: Path, image: np.ndarray, *, quality: int = 90) -> None:
    Image.fromarray(np.asarray(image, dtype=np.uint8)).save(
        path,
        quality=quality,
    )


def _feature_diagnostic(feature: FeatureSet) -> np.ndarray:
    diagnostic = feature.analysis_image.copy()
    for x, y in feature.points * feature.analysis_scale:
        cv2.circle(
            diagnostic,
            (round(float(x)), round(float(y))),
            2,
            (255, 190, 40),
            1,
            lineType=cv2.LINE_AA,
        )
    return diagnostic


def _pair_diagnostic(
    left: FeatureSet,
    right: FeatureSet,
    matches: MatchResult,
    *,
    selected: np.ndarray | None = None,
) -> np.ndarray:
    left_image = left.analysis_image
    right_image = right.analysis_image
    height = max(left_image.shape[0], right_image.shape[0])
    width = left_image.shape[1] + right_image.shape[1]
    output = np.zeros((height, width, 3), dtype=np.uint8)
    output[: left_image.shape[0], : left_image.shape[1]] = left_image
    output[: right_image.shape[0], left_image.shape[1] :] = right_image
    keep = (
        np.ones(matches.mutual_match_count, dtype=bool)
        if selected is None
        else np.asarray(selected, dtype=bool)
    )
    left_points = left.points[matches.left_indices] * left.analysis_scale
    right_points = right.points[matches.right_indices] * right.analysis_scale
    for index in np.flatnonzero(keep):
        first = tuple(np.rint(left_points[index]).astype(int))
        second = tuple(
            np.rint(right_points[index]).astype(int)
            + np.asarray((left_image.shape[1], 0))
        )
        cv2.line(output, first, second, (60, 220, 255), 1, cv2.LINE_AA)
        cv2.circle(output, first, 2, (255, 120, 40), -1, cv2.LINE_AA)
        cv2.circle(output, second, 2, (255, 120, 40), -1, cv2.LINE_AA)
    return output


def write_debug_diagnostics(
    directory: str | Path,
    *,
    features: Sequence[FeatureSet],
    matches: Sequence[MatchResult],
    homographies: Sequence[HomographyResult],
    composed_transforms: Sequence[np.ndarray],
    warped: WarpResult,
    blended: BlendResult,
) -> None:
    """Write the six requested diagnostic categories for real inputs."""

    target = Path(directory)
    target.mkdir(parents=True, exist_ok=True)
    for index, feature in enumerate(features, start=1):
        _save_rgb(target / f"features-{index:02d}.jpg", _feature_diagnostic(feature))
    for index, (match, homography) in enumerate(
        zip(matches, homographies),
        start=1,
    ):
        left = features[index - 1]
        right = features[index]
        _save_rgb(
            target / f"matches-{index:02d}-{index + 1:02d}.jpg",
            _pair_diagnostic(left, right, match),
        )
        _save_rgb(
            target / f"inliers-{index:02d}-{index + 1:02d}.jpg",
            _pair_diagnostic(
                left,
                right,
                match,
                selected=homography.inlier_mask,
            ),
        )
    transform_payload = {
        "anchorTransforms": [item.tolist() for item in composed_transforms],
        "canvasTransforms": [item.tolist() for item in warped.transforms],
        "canvasSize": list(warped.canvas_size),
        "outputScale": warped.output_scale,
        "estimatedWorkingSetMiB": warped.estimated_working_set_mib,
    }
    (target / "transforms.json").write_text(
        json.dumps(transform_payload, indent=2),
        encoding="utf-8",
    )
    Image.fromarray((blended.seam_mask.astype(np.uint8) * 255)).save(
        target / "seam.png"
    )
    (target / "exposure.json").write_text(
        json.dumps({"gains": blended.exposure_gains}, indent=2),
        encoding="utf-8",
    )
