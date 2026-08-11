from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .errors import DefocusDepthError


@dataclass
class DepthResult:
    depth: np.ndarray
    confidence: np.ndarray
    valid: np.ndarray
    peak_index: np.ndarray
    metric_curves: np.ndarray

    def to_dict(self) -> dict:
        return {
            "depth": self.depth.tolist(),
            "confidence": self.confidence.tolist(),
            "valid": self.valid.tolist(),
            "peakIndex": self.peak_index.tolist(),
        }


def quadratic_peak(values: np.ndarray) -> tuple[float, float]:
    """Return a sub-frame maximum and its prominence over the neighbours."""
    values = np.asarray(values, dtype=np.float32).ravel()
    if values.size < 3 or not np.isfinite(values).all():
        index = float(np.nanargmax(values)) if np.isfinite(values).any() else 0.0
        return index, 0.0
    i = int(np.argmax(values))
    baseline = float(np.median(np.delete(values, i)))
    peak = float(values[i])
    prominence = max(0.0, (peak - baseline) / max(abs(peak), 1e-8))
    if 0 < i < values.size - 1:
        left, center, right = map(float, values[i - 1:i + 2])
        denominator = left - 2 * center + right
        if abs(denominator) > 1e-8:
            offset = 0.5 * (left - right) / denominator
            if abs(offset) <= 1:
                return float(i + offset), prominence
    return float(i), prominence


def estimate_relative_depth(
    scores: np.ndarray,
    *,
    texture: np.ndarray | None = None,
    min_peak_prominence: float = 0.08,
    min_texture: float = 0.02,
    reference_confidence: float = 0.45,
) -> DepthResult:
    scores = np.asarray(scores, dtype=np.float32)
    if scores.ndim != 3 or scores.shape[0] != 5:
        raise DefocusDepthError("INVALID_FRAME_COUNT")
    height, width = scores.shape[1:]
    texture = np.ones((height, width), dtype=np.float32) if texture is None else np.asarray(texture, dtype=np.float32)
    if texture.shape != (height, width):
        raise ValueError("texture shape must match score map")
    depth = np.zeros((height, width), dtype=np.float32)
    confidence = np.zeros_like(depth)
    peak = np.zeros_like(depth)
    valid = np.zeros((height, width), dtype=bool)
    for y in range(height):
        for x in range(width):
            index, prominence = quadratic_peak(scores[:, y, x])
            normalized = np.clip(index / 4.0, 0.0, 1.0)
            confidence[y, x] = np.clip(prominence * min(float(texture[y, x]) / 0.15, 1.0), 0.0, 1.0)
            depth[y, x] = normalized
            peak[y, x] = index
            valid[y, x] = bool(texture[y, x] >= min_texture and prominence >= min_peak_prominence and confidence[y, x] >= reference_confidence)
    if not np.any(valid) and float(np.max(texture, initial=0)) < min_texture:
        raise DefocusDepthError("LOW_TEXTURE")
    if float(np.max(confidence, initial=0)) < min_peak_prominence:
        raise DefocusDepthError("LOW_PEAK_PROMINENCE")
    return DepthResult(depth, confidence, valid, peak, scores)
