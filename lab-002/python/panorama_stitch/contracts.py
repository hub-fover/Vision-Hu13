"""Stable Python representations of the LAB 002 shared contract."""

from __future__ import annotations

from dataclasses import dataclass


ERROR_CODES = (
    "NOT_ENOUGH_IMAGES",
    "UNSUPPORTED_FORMAT",
    "DECODE_FAILED",
    "LOW_TEXTURE",
    "INSUFFICIENT_OVERLAP",
    "AMBIGUOUS_MATCHES",
    "HOMOGRAPHY_UNSTABLE",
    "HIGH_REPROJECTION_ERROR",
    "OUTPUT_TOO_LARGE",
    "CANCELLED",
)


@dataclass(frozen=True)
class StitchOptions:
    """Portable defaults shared by the Python teaching pipeline and Web app."""

    analysis_max_side: int = 1280
    max_features: int = 2500
    ratio_threshold: float = 0.75
    ransac_threshold_px: float = 3
    min_inliers: int = 20
    min_inlier_ratio: float = 0.25
    max_median_error_px: float = 2.5
    exposure_gain_min: float = 0.7
    exposure_gain_max: float = 1.3
    blend_width_px: int = 96
    mobile_output_megapixels: int = 12
    hd_output_megapixels: int = 24
    max_working_set_mib: int = 384
    warning_image_count: int = 6
    warning_source_megapixels: int = 60
    jpeg_quality: float = 0.92

    def to_shared_dict(self) -> dict[str, object]:
        """Return the JSON-compatible camelCase contract used by the Web app."""
        return {
            "analysisMaxSide": self.analysis_max_side,
            "maxFeatures": self.max_features,
            "ratioThreshold": self.ratio_threshold,
            "ransacThresholdPx": self.ransac_threshold_px,
            "minInliers": self.min_inliers,
            "minInlierRatio": self.min_inlier_ratio,
            "maxMedianErrorPx": self.max_median_error_px,
            "exposureGain": {"min": self.exposure_gain_min, "max": self.exposure_gain_max},
            "blendWidthPx": self.blend_width_px,
            "outputMegapixels": {
                "mobile": self.mobile_output_megapixels,
                "hd": self.hd_output_megapixels,
            },
            "maxWorkingSetMiB": self.max_working_set_mib,
            "warningThresholds": {
                "imageCount": self.warning_image_count,
                "sourceMegapixels": self.warning_source_megapixels,
            },
            "jpegQuality": self.jpeg_quality,
        }


@dataclass(frozen=True)
class MatchMetrics:
    """Quality gates measured for one adjacent image pair."""

    pair_index: int
    candidate_count: int
    ratio_match_count: int
    mutual_match_count: int
    inlier_count: int
    inlier_ratio: float
    median_reprojection_error_px: float
