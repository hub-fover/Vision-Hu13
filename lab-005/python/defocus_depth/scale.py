from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .errors import DefocusDepthError


@dataclass
class FocusDepthScale:
    focus_indices: np.ndarray
    distances_m: np.ndarray
    residual_m: float = 0.0
    schema: str = "lab005.focus-depth-scale.v1"

    def distance_for_focus(self, focus: np.ndarray | float) -> np.ndarray:
        values = np.asarray(focus, dtype=np.float64)
        result = np.interp(values, self.focus_indices, self.distances_m)
        return result.astype(np.float64)

    def to_dict(self) -> dict:
        return {
            "schema": self.schema,
            "focusIndices": self.focus_indices.astype(float).tolist(),
            "distancesM": self.distances_m.astype(float).tolist(),
            "residualM": float(self.residual_m),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "FocusDepthScale":
        if data.get("schema") != "lab005.focus-depth-scale.v1":
            raise DefocusDepthError("DEPTH_SCALE_UNCALIBRATED")
        try:
            focus = np.asarray(data["focusIndices"], dtype=np.float64)
            distance = np.asarray(data["distancesM"], dtype=np.float64)
        except (KeyError, TypeError, ValueError) as exc:
            raise DefocusDepthError("DEPTH_SCALE_UNCALIBRATED") from exc
        if focus.size < 2 or focus.size != distance.size or np.any(np.diff(focus) <= 0):
            raise DefocusDepthError("DEPTH_SCALE_UNCALIBRATED")
        return cls(focus, distance, float(data.get("residualM", 0.0)))


def calibrate_scale(focus_indices: list[float] | np.ndarray, distances_m: list[float] | np.ndarray) -> FocusDepthScale:
    focus = np.asarray(focus_indices, dtype=np.float64).ravel()
    distance = np.asarray(distances_m, dtype=np.float64).ravel()
    if focus.size < 3 or focus.size != distance.size or not np.isfinite(focus).all() or not np.isfinite(distance).all():
        raise DefocusDepthError("CALIBRATION_FAILED")
    order = np.argsort(focus)
    focus, distance = focus[order], distance[order]
    if np.any(np.diff(focus) <= 0) or np.any(distance <= 0):
        raise DefocusDepthError("CALIBRATION_FAILED")
    diffs = np.diff(distance)
    if not (np.all(diffs >= 0) or np.all(diffs <= 0)):
        raise DefocusDepthError("CALIBRATION_FAILED", "Distance mapping must be monotonic.")
    # A monotone piecewise-linear curve avoids claiming a physical lens model.
    fitted = np.interp(focus, focus, distance)
    residual = float(np.sqrt(np.mean((fitted - distance) ** 2)))
    return FocusDepthScale(focus, distance, residual)
