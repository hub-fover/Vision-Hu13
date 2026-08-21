"""Serializable public data types shared by measurement modules."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

SCHEMA_VERSION = "lab004.measurement.v1"
ANALYSIS_MAX_SIDE = 1280
TARGET_ANALYSIS_FPS = 30.0
MAX_WORKING_SET_MIB = 320
MIN_SCALE_LENGTH_PX = 40.0
MIN_TEMPLATE_SIZE_PX = 64
MIN_TEMPLATE_SCORE = 0.55
MAX_CAMERA_DRIFT_PX = 1.5
MIN_SAMPLES_FOR_SPECTRUM = 128
FREQUENCY_BAND_HZ = (0.2, 12.0)


@dataclass(frozen=True)
class ScaleReference:
    p1_px: tuple[float, float]
    p2_px: tuple[float, float]
    real_distance_m: float
    unit: str = "m"

    def to_dict(self) -> dict[str, Any]:
        return {
            "p1Px": list(self.p1_px), "p2Px": list(self.p2_px),
            "realDistanceM": self.real_distance_m, "unit": self.unit,
        }


@dataclass(frozen=True)
class TargetRegion:
    x_px: float
    y_px: float
    width_px: float
    height_px: float

    @property
    def area_px(self) -> float:
        return self.width_px * self.height_px

    @property
    def center_px(self) -> tuple[float, float]:
        return (self.x_px + self.width_px / 2, self.y_px + self.height_px / 2)

    def to_dict(self) -> dict[str, float]:
        return {"xPx": self.x_px, "yPx": self.y_px, "widthPx": self.width_px, "heightPx": self.height_px}


@dataclass(frozen=True)
class MeasurementOptions:
    method: str = "template"
    fps: float = TARGET_ANALYSIS_FPS
    max_camera_drift_px: float = MAX_CAMERA_DRIFT_PX
    min_template_score: float = MIN_TEMPLATE_SCORE


@dataclass
class TrackingSample:
    frame_index: int
    time_s: float
    dx_px: float = 0.0
    dy_px: float = 0.0
    dx_m: float = 0.0
    dy_m: float = 0.0
    score: float = 0.0
    valid: bool = True
    error_code: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SpectrumPeak:
    frequency_hz: float
    amplitude: float
    prominence: float

    def to_dict(self) -> dict[str, float]:
        return {"frequencyHz": self.frequency_hz, "amplitude": self.amplitude, "prominence": self.prominence}


@dataclass
class DisplacementSeries:
    samples: list[TrackingSample] = field(default_factory=list)
    peak_to_peak_m: float = 0.0
    rms_m: float = 0.0
    peak_to_peak_px: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "samples": [sample.to_dict() for sample in self.samples],
            "peakToPeakM": self.peak_to_peak_m, "rmsM": self.rms_m,
            "peakToPeakPx": self.peak_to_peak_px,
        }


@dataclass(frozen=True)
class TrackingDiagnostics:
    camera_stable: bool = True
    background_trackable: bool = True
    valid_ratio: float = 1.0
    mean_score: float = 0.0
    fps: float = TARGET_ANALYSIS_FPS
    error_code: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "cameraStable": self.camera_stable,
            "backgroundTrackable": self.background_trackable,
            "validRatio": self.valid_ratio,
            "meanScore": self.mean_score,
            "fps": self.fps,
            "errorCode": self.error_code,
        }


@dataclass
class MeasurementReport:
    schema_version: str = SCHEMA_VERSION
    displacement: DisplacementSeries = field(default_factory=DisplacementSeries)
    spectrum: SpectrumPeak | None = None
    diagnostics: TrackingDiagnostics = field(default_factory=TrackingDiagnostics)
    method: str = "template"
    scale: ScaleReference | None = None
    errors: list[str] = field(default_factory=list)

    @property
    def samples(self) -> list[TrackingSample]:
        """Convenience view retained for small teaching scripts."""
        return self.displacement.samples

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "method": self.method,
            "scale": self.scale.to_dict() if self.scale else None,
            "displacement": self.displacement.to_dict(),
            "spectrum": self.spectrum.to_dict() if self.spectrum else None,
            "diagnostics": self.diagnostics.to_dict(),
            "errors": self.errors,
        }
