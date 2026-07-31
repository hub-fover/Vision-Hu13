"""Public LAB 003 exposure-fusion API."""

from .alignment import AlignmentResult, align_exposures
from .analysis import analyze_exposures, luminance_score
from .cli import (
    DEFAULT_SAMPLE_RELATIVE_DIRECTORY,
    cli_main,
    default_sample_directory,
    discover_default_samples,
    exit_code_for_error,
)
from .contracts import (
    ERROR_CODES,
    AlignmentMetrics,
    CropRect,
    ExposureMetrics,
    FusionOptions,
    FusionReport,
    MotionMetrics,
)
from .crop import crop_common_region
from .errors import FusionError
from .fusion import FusionResult, estimate_working_set_mib, fuse_exposures, process_stack
from .motion import detect_motion, protect_motion
from .pyramid import (
    fuse_pyramids,
    gaussian_pyramid,
    laplacian_pyramid,
    reconstruct_laplacian,
)
from .weights import compute_quality_weights, quality_components

__all__ = [
    "ERROR_CODES",
    "AlignmentMetrics",
    "AlignmentResult",
    "CropRect",
    "DEFAULT_SAMPLE_RELATIVE_DIRECTORY",
    "ExposureMetrics",
    "FusionError",
    "FusionOptions",
    "FusionReport",
    "FusionResult",
    "MotionMetrics",
    "align_exposures",
    "analyze_exposures",
    "cli_main",
    "compute_quality_weights",
    "crop_common_region",
    "default_sample_directory",
    "detect_motion",
    "discover_default_samples",
    "estimate_working_set_mib",
    "exit_code_for_error",
    "fuse_exposures",
    "fuse_pyramids",
    "gaussian_pyramid",
    "laplacian_pyramid",
    "luminance_score",
    "process_stack",
    "protect_motion",
    "quality_components",
    "reconstruct_laplacian",
]
