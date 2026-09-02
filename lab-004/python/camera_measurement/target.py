"""Target ROI validation and texture/contrast checks."""

from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np

from .contracts import StaticSceneRegion
from .errors import MeasurementError


def _as_float(value: Any) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise MeasurementError("INVALID_FRAME", "ROI values must be finite numbers.") from exc
    if not math.isfinite(result):
        raise MeasurementError("INVALID_FRAME", "ROI values must be finite numbers.")
    return result


TargetRegion = StaticSceneRegion

def region_from_dict(data: dict[str, Any]) -> TargetRegion:
    if not isinstance(data, dict):
        raise MeasurementError("INVALID_FRAME", "Target ROI must be an object.")
    def get(*keys: str) -> Any:
        for key in keys:
            if key in data:
                return data[key]
        return None
    x, y = get("xPx", "x_px", "x"), get("yPx", "y_px", "y")
    width, height = get("widthPx", "width_px", "width"), get("heightPx", "height_px", "height")
    if None in (x, y, width, height):
        raise MeasurementError("INVALID_FRAME", "ROI is missing fields.")
    return TargetRegion(_as_float(x), _as_float(y), _as_float(width), _as_float(height))


def validate_target_region(region: TargetRegion, image_size_px: tuple[int, int], *, min_size: int = 64) -> TargetRegion:
    try:
        width, height = int(image_size_px[0]), int(image_size_px[1])
    except (TypeError, ValueError, IndexError) as exc:
        raise MeasurementError("INVALID_FRAME", "Frame dimensions are invalid.") from exc
    if width <= 0 or height <= 0:
        raise MeasurementError("INVALID_FRAME", "Frame dimensions are invalid.")
    values = (region.x_px, region.y_px, region.width_px, region.height_px)
    if not all(math.isfinite(float(value)) for value in values) or region.width_px <= 0 or region.height_px <= 0:
        raise MeasurementError("INVALID_FRAME", "ROI dimensions are invalid.")
    if region.width_px < min_size or region.height_px < min_size:
        raise MeasurementError("TARGET_TOO_SMALL", "ROI is smaller than the template minimum.")
    if region.x_px < 0 or region.y_px < 0 or region.x_px + region.width_px > width or region.y_px + region.height_px > height:
        raise MeasurementError("TARGET_TOO_SMALL", "ROI is outside the frame.")
    return region


def crop_region(frame: np.ndarray, region: TargetRegion) -> np.ndarray:
    if frame is None or np.asarray(frame).ndim < 2:
        raise MeasurementError("INVALID_FRAME", "Frame must be a two-dimensional image.")
    h, w = frame.shape[:2]
    validate_target_region(region, (w, h))
    x0, y0 = int(round(region.x_px)), int(round(region.y_px))
    x1, y1 = int(round(region.x_px + region.width_px)), int(round(region.y_px + region.height_px))
    return frame[y0:y1, x0:x1].copy()


def texture_contrast(frame: np.ndarray, region: TargetRegion) -> tuple[float, float]:
    patch = crop_region(frame, region)
    gray = patch if patch.ndim == 2 else cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
    normalized = gray.astype(np.float32) / 255.0
    texture = float(np.mean(cv2.Sobel(normalized, cv2.CV_32F, 1, 0) ** 2 + cv2.Sobel(normalized, cv2.CV_32F, 0, 1) ** 2))
    contrast = float(np.std(normalized))
    return texture, contrast


def ensure_trackable(frame: np.ndarray, region: TargetRegion, min_texture: float = 0.002, min_contrast: float = 0.01) -> None:
    texture, contrast = texture_contrast(frame, region)
    if texture < min_texture:
        raise MeasurementError("LOW_TEXTURE", "ROI texture is too weak to track.")
    if contrast < min_contrast:
        raise MeasurementError("LOW_CONTRAST", "ROI contrast is too weak to track.")


TargetRegion.from_dict = staticmethod(region_from_dict)  # type: ignore[attr-defined]
