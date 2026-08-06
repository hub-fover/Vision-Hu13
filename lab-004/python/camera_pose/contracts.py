"""Typed public data contracts for camera pose and measurement."""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal

import numpy as np
from numpy.typing import NDArray


Quality = Literal["stable", "reference-only", "unstable"]
IntrinsicsSource = Literal[
    "calibrated", "quick-calibrated", "enhanced-calibrated", "estimated"
]

CORNER_ORDER = ("TL", "TR", "BR", "BL")
OBJECT_FRAME = MappingProxyType(
    {
        "origin": "target-center",
        "xAxis": "plane-right",
        "yAxis": "plane-up",
        "zAxis": "plane-out",
    }
)
LENGTH_UNIT = "metre"
PIXEL_FRAME = "exif-corrected-analysis-image"
ANALYSIS_MAX_SIDE = 1280
MAX_WORKING_SET_MIB = 320
STABLE_MAX_NORMALIZED_RMS = 0.0015
REFERENCE_ONLY_MAX_NORMALIZED_RMS = 0.0035
POSE_AMBIGUITY_MAX_ABSOLUTE_DIFFERENCE_PX = 0.25
POSE_AMBIGUITY_MAX_RELATIVE_DIFFERENCE = 0.10
CALIBRATION_SCHEMA = "lab004.camera-intrinsics.v1"
TRACKING_DEFAULTS = MappingProxyType(
    {
        "targetAnalysisFps": 12,
        "maxTrackedFeatures": 300,
        "minTrackedFeatures": 12,
        "minHomographyInlierRatio": 0.60,
        "maxMedianForwardBackwardErrorPx": 1.5,
        "maxConsecutiveBadFrames": 3,
    }
)


@dataclass(frozen=True)
class PlaneTarget:
    """Physical rectangular target, with dimensions serialized in metres."""

    width_m: float
    height_m: float


@dataclass(frozen=True)
class ImagePoint:
    """Point in EXIF-corrected analysis-image pixels."""

    x_px: float
    y_px: float


@dataclass(frozen=True)
class CameraIntrinsics:
    """Pinhole intrinsics associated with one corrected analysis image size."""

    camera_matrix: NDArray[np.float64]
    distortion: NDArray[np.float64]
    image_size_px: tuple[int, int]
    source: IntrinsicsSource
    estimation_method: str | None = None


@dataclass(frozen=True)
class CalibrationView:
    """Object/image correspondences from one accepted calibration view."""

    image_size_px: tuple[int, int]
    object_points_m: NDArray[np.float64]
    image_points_px: NDArray[np.float64]


@dataclass(frozen=True)
class CalibrationMetrics:
    """Calibration accuracy and view-count diagnostics."""

    rms_px: float
    normalized_rms: float
    accepted_views: int


@dataclass(frozen=True)
class CalibrationResult:
    """Versioned calibrated intrinsics and quality metrics."""

    schema: str
    intrinsics: CameraIntrinsics
    metrics: CalibrationMetrics


@dataclass(frozen=True)
class PoseEstimate:
    """Object-to-camera pose and derived camera-center measurements."""

    rotation_matrix: NDArray[np.float64]
    rotation_vector: NDArray[np.float64]
    translation_m: NDArray[np.float64]
    camera_center_m: NDArray[np.float64]
    euler_zyx_rad: tuple[float, float, float]
    perpendicular_distance_m: float
    target_center_distance_m: float
    horizontal_offset_m: float
    vertical_offset_m: float
    reprojection_rms_px: float
    normalized_rms: float
    quality: Quality


@dataclass(frozen=True)
class TrackingMetrics:
    """Feature-tracking acceptance metrics for one live frame."""

    tracked_features: int
    homography_inlier_ratio: float
    median_forward_backward_error_px: float
    consecutive_bad_frames: int


@dataclass(frozen=True)
class MeasurementInterval:
    """Central uncertainty interval, serialized in metres."""

    median_m: float
    lower_m: float
    upper_m: float
    confidence: float = 0.90


@dataclass(frozen=True)
class MeasurementReport:
    """Pose measurements, optional uncertainty interval, and final quality."""

    perpendicular_distance_m: float
    target_center_distance_m: float
    horizontal_offset_m: float
    vertical_offset_m: float
    distance_interval: MeasurementInterval | None
    quality: Quality
