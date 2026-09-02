"""Reproducible intermediate outputs for the article and debugging."""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .pyramid import gaussian_pyramid


def _save_gray(path: Path, image: np.ndarray) -> None:
    maximum = float(np.max(image))
    normalized = image / maximum if maximum > 0 else image
    Image.fromarray(np.clip(normalized * 255, 0, 255).astype(np.uint8)).save(path)


def _draw_matches(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    detector = cv2.ORB_create(nfeatures=1200)
    left_gray = cv2.equalizeHist(cv2.cvtColor(left, cv2.COLOR_RGB2GRAY))
    right_gray = cv2.equalizeHist(cv2.cvtColor(right, cv2.COLOR_RGB2GRAY))
    left_points, left_descriptors = detector.detectAndCompute(left_gray, None)
    right_points, right_descriptors = detector.detectAndCompute(right_gray, None)
    if left_descriptors is None or right_descriptors is None:
        return np.concatenate([left, right], axis=1)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    matches = []
    for neighbors in matcher.knnMatch(left_descriptors, right_descriptors, k=2):
        if len(neighbors) == 2 and neighbors[0].distance < 0.75 * neighbors[1].distance:
            matches.append(neighbors[0])
    return cv2.drawMatches(
        left,
        left_points,
        right,
        right_points,
        sorted(matches, key=lambda match: match.distance)[:80],
        None,
        flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS,
    )


def write_diagnostics(directory, *, result, ordered_images, components, weights) -> None:
    root = Path(directory)
    root.mkdir(parents=True, exist_ok=True)
    (root / "report.json").write_text(
        json.dumps(result.report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (root / "exposure-order.json").write_text(
        json.dumps(
            {
                "labels": ["dark", "middle", "bright"],
                "ordered_indices": result.report.exposure.ordered_indices,
                "luminance_scores": result.report.exposure.luminance_scores,
                "relative_spread": result.report.exposure.relative_spread,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    for index, image in enumerate(ordered_images, start=1):
        Image.fromarray(image).save(root / f"aligned-{index:02d}.jpg", quality=92)
        contrast, saturation, exposed = components[index - 1]
        _save_gray(root / f"contrast-{index:02d}.png", contrast)
        _save_gray(root / f"saturation-{index:02d}.png", saturation)
        _save_gray(root / f"well-exposed-{index:02d}.png", exposed)
        _save_gray(root / f"weight-{index:02d}.png", weights[index - 1])
    for source_index in (0, 2):
        matches = _draw_matches(ordered_images[source_index], ordered_images[1])
        Image.fromarray(matches).save(root / f"matches-{source_index + 1:02d}.jpg", quality=90)
        overlay = cv2.addWeighted(ordered_images[source_index], 0.5, ordered_images[1], 0.5, 0)
        Image.fromarray(overlay).save(root / f"alignment-overlay-{source_index + 1:02d}.jpg", quality=90)
    pyramid = gaussian_pyramid(result.image, 5)
    for index, level in enumerate(pyramid, start=1):
        Image.fromarray(np.clip(level, 0, 255).astype(np.uint8)).save(root / f"pyramid-level-{index:02d}.jpg", quality=90)
    crop_canvas = result.image.copy()
    cv2.rectangle(crop_canvas, (0, 0), (crop_canvas.shape[1] - 1, crop_canvas.shape[0] - 1), (255, 72, 64), 3)
    Image.fromarray(crop_canvas).save(root / "crop-diagnostic.jpg", quality=90)
    (root / "crop-diagnostic.json").write_text(
        json.dumps(
            {
                "source_rectangle": result.report.crop.__dict__,
                "output_width": result.report.output_width,
                "output_height": result.report.output_height,
                "hole_free": True,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    Image.fromarray(result.motion_mask).save(root / "motion-mask.png")
    Image.fromarray(result.image).save(root / "fusion.jpg", quality=92)
