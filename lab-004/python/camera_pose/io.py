"""EXIF-corrected image loading and conservative intrinsics estimation."""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import numpy as np
from numpy.typing import ArrayLike, NDArray
from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError

from .contracts import ANALYSIS_MAX_SIDE, CameraIntrinsics
from .errors import CameraPoseError


SUPPORTED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})


@dataclass(frozen=True)
class AnalysisImage:
    """Corrected analysis bitmap and scale mapping to corrected source pixels."""

    image: Image.Image
    corrected_size_px: tuple[int, int]
    analysis_size_px: tuple[int, int]
    exif: Mapping[str, object]

    def analysis_to_corrected(self, points: ArrayLike) -> NDArray[np.float64]:
        values = _point_array(points)
        scale = np.asarray(self.corrected_size_px) / np.asarray(self.analysis_size_px)
        return values * scale

    def corrected_to_analysis(self, points: ArrayLike) -> NDArray[np.float64]:
        values = _point_array(points)
        scale = np.asarray(self.analysis_size_px) / np.asarray(self.corrected_size_px)
        return values * scale


def load_analysis_image(path: str | Path) -> AnalysisImage:
    """Load JPEG/PNG/WebP, apply EXIF orientation, then resize for analysis."""
    try:
        with Image.open(path) as opened:
            if opened.format not in SUPPORTED_FORMATS:
                raise CameraPoseError("UNSUPPORTED_CAMERA", "Unsupported image format.")
            metadata = {
                ExifTags.TAGS.get(tag, str(tag)): value
                for tag, value in opened.getexif().items()
            }
            corrected = ImageOps.exif_transpose(opened).convert("RGB")
    except CameraPoseError:
        raise
    except (OSError, UnidentifiedImageError) as error:
        raise CameraPoseError("UNSUPPORTED_CAMERA", "Image cannot be decoded.") from error

    corrected_size = corrected.size
    scale = min(1.0, ANALYSIS_MAX_SIDE / max(corrected_size))
    analysis_size = tuple(max(1, int(round(value * scale))) for value in corrected_size)
    if analysis_size != corrected_size:
        corrected = corrected.resize(analysis_size, Image.Resampling.LANCZOS)
    return AnalysisImage(
        image=corrected,
        corrected_size_px=corrected_size,
        analysis_size_px=analysis_size,
        exif=metadata,
    )


def estimate_uncalibrated_intrinsics(
    image_size_px: tuple[int, int], exif: Mapping[str, object] | None = None
) -> CameraIntrinsics:
    """Estimate square-pixel zero-distortion intrinsics from complete EXIF or FOV."""
    width, height = _valid_image_size(image_size_px)
    metadata = exif or {}
    physical = _positive_number(metadata.get("FocalLength"))
    equivalent = _positive_number(metadata.get("FocalLengthIn35mmFilm"))
    sensor_metadata_present = any(
        key in metadata
        for key in (
            "SensorWidthMm",
            "SensorHeightMm",
            "FocalPlaneXResolution",
            "FocalPlaneYResolution",
            "FocalPlaneResolutionUnit",
        )
    )
    sensor_dimensions = _sensor_dimensions_mm(metadata)

    focal_px: float | None = None
    method: str | None = None
    if physical is not None and sensor_metadata_present:
        if sensor_dimensions is not None:
            sensor_width, sensor_height = sensor_dimensions
            image_aspect = max(width, height) / min(width, height)
            sensor_aspect = max(sensor_width, sensor_height) / min(
                sensor_width, sensor_height
            )
            crop_factor = math.hypot(36.0, 24.0) / math.hypot(
                sensor_width, sensor_height
            )
            equivalent_consistent = equivalent is None or _relative_close(
                equivalent, physical * crop_factor, 0.10
            )
            if (
                _relative_close(image_aspect, sensor_aspect, 0.05)
                and 0.5 <= crop_factor <= 20.0
                and equivalent_consistent
            ):
                sensor_axis = (
                    max(sensor_width, sensor_height)
                    if width >= height
                    else min(sensor_width, sensor_height)
                )
                focal_px = physical * width / sensor_axis
                method = "exif-sensor-size"
    elif physical is not None and equivalent is not None:
        crop_factor = equivalent / physical
        if 0.5 <= crop_factor <= 20.0:
            focal_px = equivalent * max(width, height) / 36.0
            method = "exif-35mm-equivalent"

    if focal_px is None or not math.isfinite(focal_px) or focal_px <= 0:
        focal_px = width / (2.0 * math.tan(math.radians(60.0) / 2.0))
        method = "horizontal-fov-60"

    camera_matrix = np.asarray(
        [[focal_px, 0.0, width / 2.0], [0.0, focal_px, height / 2.0], [0.0, 0.0, 1.0]],
        dtype=np.float64,
    )
    return CameraIntrinsics(
        camera_matrix=camera_matrix,
        distortion=np.zeros(5, dtype=np.float64),
        image_size_px=(width, height),
        source="estimated",
        estimation_method=method,
    )


def _point_array(points: ArrayLike) -> NDArray[np.float64]:
    values = np.asarray(points, dtype=np.float64)
    if values.ndim != 2 or values.shape[1] != 2 or not np.isfinite(values).all():
        raise CameraPoseError("INVALID_QUAD")
    return values


def _valid_image_size(image_size_px: tuple[int, int]) -> tuple[int, int]:
    try:
        values = np.asarray(image_size_px, dtype=np.float64)
    except (TypeError, ValueError, OverflowError) as error:
        raise CameraPoseError("INVALID_DIMENSIONS") from error
    if (
        values.shape != (2,)
        or not np.isfinite(values).all()
        or np.any(values <= 0)
        or np.any(values != np.floor(values))
    ):
        raise CameraPoseError("INVALID_DIMENSIONS")
    return int(values[0]), int(values[1])


def _positive_number(value: object) -> float | None:
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError, OverflowError):
        return None
    return result if math.isfinite(result) and result > 0 else None


def _relative_close(first: float, second: float, tolerance: float) -> bool:
    return abs(first - second) <= tolerance * max(abs(first), abs(second))


def _sensor_dimensions_mm(
    metadata: Mapping[str, object],
) -> tuple[float, float] | None:
    explicit_width = _positive_number(metadata.get("SensorWidthMm"))
    explicit_height = _positive_number(metadata.get("SensorHeightMm"))
    if explicit_width is not None and explicit_height is not None:
        return explicit_width, explicit_height

    x_resolution = _positive_number(metadata.get("FocalPlaneXResolution"))
    y_resolution = _positive_number(metadata.get("FocalPlaneYResolution"))
    pixel_width = _positive_number(
        metadata.get("PixelXDimension", metadata.get("ExifImageWidth"))
    )
    pixel_height = _positive_number(
        metadata.get("PixelYDimension", metadata.get("ExifImageHeight"))
    )
    try:
        resolution_unit = int(metadata.get("FocalPlaneResolutionUnit", 0))
    except (TypeError, ValueError, OverflowError):
        return None
    unit_mm = {2: 25.4, 3: 10.0, 4: 1.0, 5: 0.001}.get(resolution_unit)
    if None in (x_resolution, y_resolution, pixel_width, pixel_height, unit_mm):
        return None
    return (
        float(pixel_width) / float(x_resolution) * float(unit_mm),
        float(pixel_height) / float(y_resolution) * float(unit_mm),
    )
