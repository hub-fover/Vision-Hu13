"""Mertens contrast, saturation, and well-exposedness weights."""

from __future__ import annotations

from collections.abc import Sequence

import cv2
import numpy as np

from .contracts import FusionOptions


def quality_components(image: np.ndarray, sigma: float = 0.2) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    normalized = image.astype(np.float32) / 255.0
    gray = cv2.cvtColor(normalized, cv2.COLOR_RGB2GRAY)
    contrast = np.abs(cv2.Laplacian(
        gray,
        cv2.CV_32F,
        ksize=1,
        borderType=cv2.BORDER_REPLICATE,
    ))
    saturation = np.std(normalized, axis=2)
    exposed = np.prod(
        np.exp(-0.5 * ((normalized - 0.5) / sigma) ** 2),
        axis=2,
    )
    return contrast, saturation, exposed


def compute_quality_weights(
    images: Sequence[np.ndarray],
    options: FusionOptions | None = None,
) -> tuple[np.ndarray, tuple[tuple[np.ndarray, np.ndarray, np.ndarray], ...]]:
    selected = options or FusionOptions()
    components = tuple(quality_components(image, selected.well_exposed_sigma) for image in images)
    raw = []
    for contrast, saturation, exposed in components:
        weight = (
            np.maximum(contrast, 1e-6) ** selected.contrast_weight
            * np.maximum(saturation, 1e-6) ** selected.saturation_weight
            * np.maximum(exposed, 1e-6) ** selected.well_exposedness_weight
        )
        raw.append(weight + 1e-12)
    stacked = np.stack(raw, axis=0).astype(np.float32)
    stacked /= np.sum(stacked, axis=0, keepdims=True)
    return stacked, components
