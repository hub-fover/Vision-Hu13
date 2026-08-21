"""Normalized template matching with a small sub-pixel peak refinement."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .contracts import MIN_TEMPLATE_SCORE, TargetRegion, TrackingSample
from .errors import MeasurementError
from .target import ensure_trackable, validate_target_region


@dataclass(frozen=True)
class TemplateMatch:
    dx_px: float
    dy_px: float
    score: float
    peak_x: float
    peak_y: float


def quadratic_peak_offset(scores: np.ndarray | list[float]) -> float:
    values = np.asarray(scores, dtype=np.float64).reshape(-1)
    if values.size != 3 or not np.isfinite(values).all():
        return 0.0
    denominator = values[0] - 2 * values[1] + values[2]
    if abs(denominator) < 1e-12:
        return 0.0
    return float(np.clip(0.5 * (values[0] - values[2]) / denominator, -0.5, 0.5))


def _gray(frame: np.ndarray) -> np.ndarray:
    if frame is None or not isinstance(frame, np.ndarray) or frame.ndim not in (2, 3):
        raise MeasurementError("INVALID_FRAME", "Frame must be an image array.")
    return frame if frame.ndim == 2 else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def match_template(reference: np.ndarray, frame: np.ndarray, region: TargetRegion, min_score: float = MIN_TEMPLATE_SCORE) -> TemplateMatch:
    reference_gray, frame_gray = _gray(reference), _gray(frame)
    validate_target_region(region, (reference_gray.shape[1], reference_gray.shape[0]))
    if frame_gray.shape[:2] != reference_gray.shape[:2]:
        raise MeasurementError("SCENE_CHANGED", "Frames have different dimensions.")
    ensure_trackable(reference_gray, region)
    x, y = int(round(region.x_px)), int(round(region.y_px))
    width, height = int(round(region.width_px)), int(round(region.height_px))
    template = reference_gray[y:y + height, x:x + width]
    if template.size == 0 or template.shape[0] > frame_gray.shape[0] or template.shape[1] > frame_gray.shape[1]:
        raise MeasurementError("TARGET_TOO_SMALL", "Template does not fit the frame.")
    result = cv2.matchTemplate(frame_gray, template, cv2.TM_CCOEFF_NORMED)
    _, score, _, location = cv2.minMaxLoc(result)
    if not np.isfinite(score) or float(score) < float(min_score):
        raise MeasurementError("TEMPLATE_LOST", "Template correlation score is below the quality gate.")
    px, py = float(location[0]), float(location[1])
    col, row = location
    if 0 < col < result.shape[1] - 1:
        px += quadratic_peak_offset(result[row, col - 1:col + 2])
    if 0 < row < result.shape[0] - 1:
        py += quadratic_peak_offset(result[row - 1:row + 2, col])
    return TemplateMatch(px + width / 2 - (region.x_px + region.width_px / 2), py + height / 2 - (region.y_px + region.height_px / 2), float(score), px, py)


def track_template_sequence(
    frames: list[np.ndarray], region: TargetRegion, *, fps: float = 30.0, min_score: float = MIN_TEMPLATE_SCORE
) -> list[TrackingSample]:
    if not frames:
        raise MeasurementError("INVALID_FRAME", "At least one frame is required.")
    reference = frames[0]
    gray = _gray(reference)
    validate_target_region(region, (gray.shape[1], gray.shape[0]))
    ensure_trackable(gray, region)
    samples = [TrackingSample(0, 0.0, 0.0, 0.0, score=1.0)]
    for index, frame in enumerate(frames[1:], 1):
        try:
            match = match_template(reference, frame, region, min_score)
            samples.append(TrackingSample(index, index / fps, match.dx_px, match.dy_px, score=match.score))
        except MeasurementError as error:
            if error.code in {"SCENE_CHANGED", "INVALID_FRAME", "TARGET_TOO_SMALL", "LOW_TEXTURE", "LOW_CONTRAST"}:
                raise
            samples.append(TrackingSample(index, index / fps, valid=False, error_code=error.code))
    return samples

