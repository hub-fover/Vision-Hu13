"""Two-point physical scale validation and conversion."""

from __future__ import annotations

import math
from dataclasses import replace
from typing import Any

import numpy as np

from .contracts import MIN_SCALE_LENGTH_PX, ScaleReference
from .errors import MeasurementError

UNIT_TO_METRES = {"m": 1.0, "cm": 0.01, "mm": 0.001}


def validate_unit(unit: str) -> str:
    normalized = str(unit).strip().lower()
    if normalized not in UNIT_TO_METRES:
        raise MeasurementError("INVALID_SCALE", f"Unsupported length unit: {unit}")
    return normalized


def _point(point: Any) -> tuple[float, float]:
    try:
        x, y = float(point[0]), float(point[1])
    except (TypeError, ValueError, IndexError, KeyError) as exc:
        raise MeasurementError("INVALID_SCALE", "Scale points must contain two finite numbers.") from exc
    if not math.isfinite(x) or not math.isfinite(y):
        raise MeasurementError("INVALID_SCALE", "Scale points must be finite.")
    return x, y


def from_points(
    p1: Any, p2: Any, real_distance: float, unit: str = "m"
) -> ScaleReference:
    p1v, p2v = _point(p1), _point(p2)
    try:
        distance = float(real_distance)
    except (TypeError, ValueError, OverflowError) as exc:
        raise MeasurementError("INVALID_SCALE", "Real distance must be positive.") from exc
    unit_norm = validate_unit(unit)
    pixel_distance = math.hypot(p2v[0] - p1v[0], p2v[1] - p1v[1])
    if not math.isfinite(distance) or distance <= 0 or pixel_distance < MIN_SCALE_LENGTH_PX:
        raise MeasurementError("INVALID_SCALE", "Scale line must be positive and at least 40 pixels.")
    return ScaleReference(
        p1_px=p1v, p2_px=p2v,
        real_distance_m=distance * UNIT_TO_METRES[unit_norm], unit=unit_norm,
    )


def validate_scale_reference(reference: ScaleReference, image_size_px: tuple[int, int] | None = None) -> ScaleReference:
    unit = validate_unit(reference.unit)
    result = from_points(reference.p1_px, reference.p2_px, reference.real_distance_m, "m")
    if image_size_px is not None:
        try:
            width, height = int(image_size_px[0]), int(image_size_px[1])
        except (TypeError, ValueError, IndexError) as exc:
            raise MeasurementError("INVALID_FRAME", "Image dimensions are invalid.") from exc
        if width <= 0 or height <= 0:
            raise MeasurementError("INVALID_FRAME", "Image dimensions are invalid.")
        for point in (result.p1_px, result.p2_px):
            if not (0 <= point[0] < width and 0 <= point[1] < height):
                raise MeasurementError("INVALID_SCALE", "Scale points must be inside the frame.")
    return replace(result, unit=unit)


def scale_from_dict(data: dict[str, Any], image_size_px: tuple[int, int] | None = None) -> ScaleReference:
    if not isinstance(data, dict):
        raise MeasurementError("INVALID_SCALE", "Scale reference must be an object.")
    p1 = data.get("p1Px", data.get("p1_px"))
    p2 = data.get("p2Px", data.get("p2_px"))
    distance = data.get("realDistance", data.get("realDistanceM", data.get("real_distance_m")))
    unit = data.get("unit", "m")
    if p1 is None or p2 is None or distance is None:
        raise MeasurementError("INVALID_SCALE", "Scale reference is missing fields.")
    result = from_points(p1, p2, distance, unit)
    if image_size_px is not None:
        validate_scale_reference(result, image_size_px)
    return result


def pixels_to_metres(values: Any, reference: ScaleReference) -> np.ndarray:
    scale = reference.real_distance_m / math.hypot(
        reference.p2_px[0] - reference.p1_px[0], reference.p2_px[1] - reference.p1_px[1]
    )
    array = np.asarray(values, dtype=np.float64)
    return array * scale


def metres_to_pixels(values: Any, reference: ScaleReference) -> np.ndarray:
    scale = reference.real_distance_m / math.hypot(
        reference.p2_px[0] - reference.p1_px[0], reference.p2_px[1] - reference.p1_px[1]
    )
    return np.asarray(values, dtype=np.float64) / scale


ScaleReference.from_points = staticmethod(from_points)  # type: ignore[attr-defined]
ScaleReference.from_dict = staticmethod(scale_from_dict)  # type: ignore[attr-defined]
