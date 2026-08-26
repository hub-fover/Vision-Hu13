"""Public serialisable contract for LAB004 static-scene speed."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

SCHEMA_VERSION = "lab004.static-scene-speed.v2"
ANALYSIS_MAX_SIDE = 1280
TARGET_ANALYSIS_FPS = 30.0
MAX_WORKING_SET_MIB = 320
MIN_SCALE_LENGTH_PX = 40.0
MAX_CAMERA_DRIFT_PX = 1.5
QUALITY_STABLE_CONFIDENCE = 0.8
QUALITY_REFERENCE_CONFIDENCE = 0.5


@dataclass(frozen=True)
class ScaleReference:
    p1_px: tuple[float, float]
    p2_px: tuple[float, float]
    real_distance_m: float
    unit: str = "m"

    def to_dict(self) -> dict[str, Any]:
        return {"p1Px": list(self.p1_px), "p2Px": list(self.p2_px), "realDistanceM": self.real_distance_m, "unit": self.unit}


@dataclass(frozen=True)
class StaticSceneRegion:
    x_px: float
    y_px: float
    width_px: float
    height_px: float

    @property
    def area_px(self) -> float:
        return self.width_px * self.height_px

    @property
    def center_px(self) -> tuple[float, float]:
        return (self.x_px + self.width_px / 2.0, self.y_px + self.height_px / 2.0)

    def to_dict(self) -> dict[str, float]:
        return {"xPx": self.x_px, "yPx": self.y_px, "widthPx": self.width_px, "heightPx": self.height_px}


@dataclass(frozen=True)
class SpeedOptions:
    fps: float = TARGET_ANALYSIS_FPS
    max_camera_drift_px: float = MAX_CAMERA_DRIFT_PX
    max_forward_backward_error_px: float = 1.5
    min_inlier_ratio: float = 0.60
    min_tracked_points: int = 12

    def to_dict(self) -> dict[str, Any]:
        return {"fps": self.fps, "maxCameraDriftPx": self.max_camera_drift_px, "maxForwardBackwardErrorPx": self.max_forward_backward_error_px, "minInlierRatio": self.min_inlier_ratio, "minTrackedPoints": self.min_tracked_points}


@dataclass
class SpeedSample:
    frame_index: int
    time_s: float
    velocity_mps: float = 0.0
    velocity_kmh: float = 0.0
    vx_mps: float = 0.0
    vy_mps: float = 0.0
    direction_deg: float = 0.0
    confidence: float = 0.0
    valid: bool = True
    error_code: str | None = None
    # Pixel displacement is retained as a diagnostic source for the speed
    # conversion; the headline report is expressed in metres per second.
    dx_px: float = 0.0
    dy_px: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {"frameIndex": self.frame_index, "timeS": self.time_s, "velocityMps": self.velocity_mps, "velocityKmh": self.velocity_kmh, "vxMps": self.vx_mps, "vyMps": self.vy_mps, "directionDeg": self.direction_deg, "confidence": self.confidence, "valid": self.valid, "errorCode": self.error_code, "dxPx": self.dx_px, "dyPx": self.dy_px}


@dataclass
class SpeedSeries:
    samples: list[SpeedSample] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"samples": [sample.to_dict() for sample in self.samples]}


@dataclass(frozen=True)
class SpeedDiagnostics:
    inlier_count: int = 0
    inlier_ratio: float = 0.0
    median_reprojection_error_px: float = 0.0
    forward_backward_error_px: float = 0.0
    tracked_point_count: int = 0
    camera_stable: bool = True
    scene_texture_score: float = 0.0
    valid_ratio: float = 0.0
    fps: float = TARGET_ANALYSIS_FPS
    failure_intervals: tuple[dict[str, Any], ...] = ()
    error_code: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "inlierCount": self.inlier_count,
            "inlierRatio": self.inlier_ratio,
            "medianReprojectionErrorPx": self.median_reprojection_error_px,
            "forwardBackwardErrorPx": self.forward_backward_error_px,
            "trackedPointCount": self.tracked_point_count,
            "cameraStable": self.camera_stable,
            "sceneTextureScore": self.scene_texture_score,
            "validRatio": self.valid_ratio,
            "fps": self.fps,
            "failureIntervals": list(self.failure_intervals),
            "errorCode": self.error_code,
        }


@dataclass
class SpeedReport:
    velocity_mps: float = 0.0
    velocity_kmh: float = 0.0
    direction_deg: float = 0.0
    mean_speed_mps: float = 0.0
    peak_speed_mps: float = 0.0
    valid_ratio: float = 0.0
    samples: list[SpeedSample] = field(default_factory=list)
    diagnostics: SpeedDiagnostics = field(default_factory=SpeedDiagnostics)
    scale: ScaleReference | None = None
    errors: list[str] = field(default_factory=list)
    schema_version: str = SCHEMA_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "velocityMps": self.velocity_mps,
            "velocityKmh": self.velocity_kmh,
            "directionDeg": self.direction_deg,
            "meanSpeedMps": self.mean_speed_mps,
            "peakSpeedMps": self.peak_speed_mps,
            "validRatio": self.valid_ratio,
            "samples": [sample.to_dict() for sample in self.samples],
            "diagnostics": self.diagnostics.to_dict(),
            "scale": self.scale.to_dict() if self.scale else None,
            "errors": self.errors,
        }


MeasurementReport = SpeedReport
