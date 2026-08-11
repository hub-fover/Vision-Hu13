"""Local focus-stack depth estimation for LAB 005."""

from .errors import DefocusDepthError
from .depth import DepthResult, estimate_relative_depth
from .focus_metrics import focus_curve
from .intrinsics import CameraIntrinsics
from .scale import FocusDepthScale, calibrate_scale

__all__ = [
    "CameraIntrinsics", "DefocusDepthError", "DepthResult", "FocusDepthScale",
    "calibrate_scale", "estimate_relative_depth", "focus_curve",
]
