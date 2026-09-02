"""Conservative motion detection and reference-frame protection."""

from __future__ import annotations

from collections.abc import Sequence

import cv2
import numpy as np

from .contracts import MotionMetrics


def detect_motion(images: Sequence[np.ndarray], threshold: int = 24) -> np.ndarray:
    normalized = []
    for image in images:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        normalized.append(cv2.equalizeHist(gray))
    stack = np.stack(normalized, axis=0).astype(np.int16)
    median = np.median(stack, axis=0)
    difference = np.max(np.abs(stack - median), axis=0)
    mask = (difference >= threshold).astype(np.uint8) * 255
    kernel = np.ones((3, 3), dtype=np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    return cv2.dilate(mask, np.ones((5, 5), dtype=np.uint8))


def protect_motion(weights: np.ndarray, mask: np.ndarray, reference_index: int = 1) -> tuple[np.ndarray, MotionMetrics]:
    alpha = cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (0, 0), 2.0)
    protected = weights * (1.0 - alpha[None, ...])
    protected[reference_index] += alpha
    protected /= np.sum(protected, axis=0, keepdims=True)
    fraction = float(np.mean(mask > 0))
    return protected, MotionMetrics(detected_fraction=fraction, protected_fraction=fraction)
