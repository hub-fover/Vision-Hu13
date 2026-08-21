"""Small Python-only DIC teaching helper for regular textured patches."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .contracts import TargetRegion
from .errors import MeasurementError
from .target import crop_region, ensure_trackable


@dataclass(frozen=True)
class DICResult:
    dx_px: float
    dy_px: float
    score: float
    valid_points: int


def estimate_dic_translation(reference: np.ndarray, frame: np.ndarray, region: TargetRegion, grid_step: int = 12) -> DICResult:
    if reference is None or frame is None or reference.shape[:2] != frame.shape[:2]:
        raise MeasurementError("INVALID_FRAME", "DIC frames must have equal dimensions.")
    ensure_trackable(reference, region)
    # Add a narrow border so a small translation does not clip the correlation
    # window at the selected ROI edge.
    padding = max(8, int(round(min(region.width_px, region.height_px) * 0.15)))
    x0 = max(0, int(round(region.x_px)) - padding)
    y0 = max(0, int(round(region.y_px)) - padding)
    x1 = min(reference.shape[1], int(round(region.x_px + region.width_px)) + padding)
    y1 = min(reference.shape[0], int(round(region.y_px + region.height_px)) + padding)
    reference_patch = reference[y0:y1, x0:x1].copy()
    frame_patch = frame[y0:y1, x0:x1].copy()
    ref_gray = reference_patch if reference_patch.ndim == 2 else cv2.cvtColor(reference_patch, cv2.COLOR_BGR2GRAY)
    cur_gray = frame_patch if frame_patch.ndim == 2 else cv2.cvtColor(frame_patch, cv2.COLOR_BGR2GRAY)
    shift, response = cv2.phaseCorrelate(ref_gray.astype(np.float32), cur_gray.astype(np.float32))
    if not np.isfinite(shift).all() or float(response) < 0.02:
        raise MeasurementError("TEMPLATE_LOST", "DIC correlation response is too weak.")
    points = max(1, (ref_gray.shape[0] // max(grid_step, 1)) * (ref_gray.shape[1] // max(grid_step, 1)))
    return DICResult(float(shift[0]), float(shift[1]), float(response), points)
