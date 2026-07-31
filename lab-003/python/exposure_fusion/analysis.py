"""Relative exposure analysis without pretending JPEG values are calibrated EV."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from .contracts import ExposureMetrics
from .errors import FusionError


MIN_RELATIVE_EXPOSURE_SPREAD = 0.75


def _linearize(channel: np.ndarray) -> np.ndarray:
    normalized = channel.astype(np.float32) / 255.0
    return np.where(
        normalized <= 0.04045,
        normalized / 12.92,
        ((normalized + 0.055) / 1.055) ** 2.4,
    )


def luminance_score(image: np.ndarray) -> float:
    linear = _linearize(image)
    luminance = (
        linear[..., 0] * 0.2126
        + linear[..., 1] * 0.7152
        + linear[..., 2] * 0.0722
    )
    positive = np.clip(luminance, 1e-4, 1.0)
    return float(np.log2(np.exp(np.mean(np.log(positive)))))


def analyze_exposures(images: Sequence[np.ndarray]) -> ExposureMetrics:
    if len(images) != 3:
        raise FusionError("INVALID_IMAGE_COUNT", "Choose exactly three exposures.")
    scores = tuple(luminance_score(image) for image in images)
    order = tuple(sorted(range(3), key=scores.__getitem__))
    ordered_scores = tuple(scores[index] for index in order)
    spread = ordered_scores[-1] - ordered_scores[0]
    if spread < MIN_RELATIVE_EXPOSURE_SPREAD:
        raise FusionError(
            "EXPOSURE_SPREAD_TOO_SMALL",
            "The three photos are too similar; capture a darker and a brighter frame.",
        )
    shadows = tuple(float(np.mean(image <= 5)) for image in images)
    highlights = tuple(float(np.mean(image >= 250)) for image in images)
    return ExposureMetrics(
        ordered_indices=order,
        luminance_scores=scores,
        relative_spread=float(spread),
        shadow_clipping=shadows,
        highlight_clipping=highlights,
    )
