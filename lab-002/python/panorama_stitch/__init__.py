"""Teaching contracts and pipeline entry points for LAB 002."""

from .cli import (
    DEFAULT_SAMPLE_RELATIVE_DIRECTORY,
    cli_main,
    discover_default_samples,
    exit_code_for_error,
)
from .contracts import ERROR_CODES, MatchMetrics, StitchOptions
from .errors import StitchError
from .features import FeatureSet, MatchResult, extract_features, match_pair
from .geometry import HomographyResult, compose_transforms, estimate_homography
from .io import load_image, resize_for_analysis
from .pipeline import StitchResult, input_warnings, stitch_images
from .render import (
    BlendResult,
    CanvasPlan,
    CropRect,
    WarpResult,
    auto_crop,
    blend_panorama,
    plan_canvas,
    warp_images,
)

__all__ = [
    "BlendResult",
    "CanvasPlan",
    "CropRect",
    "DEFAULT_SAMPLE_RELATIVE_DIRECTORY",
    "ERROR_CODES",
    "FeatureSet",
    "HomographyResult",
    "MatchMetrics",
    "MatchResult",
    "StitchError",
    "StitchOptions",
    "StitchResult",
    "WarpResult",
    "auto_crop",
    "blend_panorama",
    "cli_main",
    "compose_transforms",
    "discover_default_samples",
    "estimate_homography",
    "exit_code_for_error",
    "extract_features",
    "input_warnings",
    "load_image",
    "match_pair",
    "plan_canvas",
    "resize_for_analysis",
    "stitch_images",
    "warp_images",
]
