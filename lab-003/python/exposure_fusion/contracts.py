"""Portable LAB 003 contracts shared with the browser runtime."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


ERROR_CODES = (
    "INVALID_IMAGE_COUNT",
    "UNSUPPORTED_FORMAT",
    "DECODE_FAILED",
    "EXPOSURE_SPREAD_TOO_SMALL",
    "SCENE_MISMATCH",
    "LOW_TEXTURE",
    "ALIGNMENT_FAILED",
    "EXCESSIVE_CROP",
    "OUTPUT_TOO_LARGE",
    "CANCELLED",
)


@dataclass(frozen=True)
class FusionOptions:
    input_count: int = 3
    analysis_max_side: int = 1280
    max_input_megapixels: int = 48
    max_output_pixels: int = 4_000_000
    max_working_set_mib: int = 320
    orb_features: int = 2000
    ratio_threshold: float = 0.75
    min_inliers: int = 30
    min_inlier_ratio: float = 0.30
    max_median_reprojection_error_px: float = 2.0
    pyramid_levels: int = 5
    contrast_weight: float = 1.0
    saturation_weight: float = 1.0
    well_exposedness_weight: float = 1.0
    well_exposed_sigma: float = 0.2
    motion_protection: bool = True
    jpeg_quality: float = 0.92

    def to_shared_dict(self) -> dict[str, Any]:
        return {
            "inputCount": self.input_count,
            "analysisMaxSide": self.analysis_max_side,
            "maxInputMegapixels": self.max_input_megapixels,
            "maxOutputPixels": self.max_output_pixels,
            "maxWorkingSetMiB": self.max_working_set_mib,
            "orbFeatures": self.orb_features,
            "ratioThreshold": self.ratio_threshold,
            "minInliers": self.min_inliers,
            "minInlierRatio": self.min_inlier_ratio,
            "maxMedianReprojectionErrorPx": self.max_median_reprojection_error_px,
            "pyramidLevels": self.pyramid_levels,
            "weights": {
                "contrast": self.contrast_weight,
                "saturation": self.saturation_weight,
                "wellExposedness": self.well_exposedness_weight,
            },
            "wellExposedSigma": self.well_exposed_sigma,
            "motionProtection": self.motion_protection,
            "jpegQuality": self.jpeg_quality,
        }


@dataclass(frozen=True)
class ExposureMetrics:
    ordered_indices: tuple[int, int, int]
    luminance_scores: tuple[float, float, float]
    relative_spread: float
    shadow_clipping: tuple[float, float, float]
    highlight_clipping: tuple[float, float, float]


@dataclass(frozen=True)
class AlignmentMetrics:
    source_index: int
    reference_index: int
    candidate_count: int
    mutual_match_count: int
    inlier_count: int
    inlier_ratio: float
    median_reprojection_error_px: float
    translation_px: float
    rotation_degrees: float
    scale: float


@dataclass(frozen=True)
class MotionMetrics:
    detected_fraction: float
    protected_fraction: float


@dataclass(frozen=True)
class CropRect:
    x: int
    y: int
    width: int
    height: int

    def apply(self, image):
        return image[self.y : self.y + self.height, self.x : self.x + self.width]


@dataclass(frozen=True)
class FusionReport:
    exposure: ExposureMetrics
    alignments: tuple[AlignmentMetrics, ...]
    motion: MotionMetrics
    crop: CropRect
    output_width: int
    output_height: int
    estimated_working_set_mib: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
