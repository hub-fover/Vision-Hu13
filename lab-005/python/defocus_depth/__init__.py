"""Local focus-stack depth estimation for LAB 005."""

from .errors import DefocusDepthError
from .contracts import DepthSample, FocusCalibration, FocusFrame, FocusMetricCurve, FocusStack, RelativeDepthMap
from .depth import DepthResult, estimate_relative_depth
from .focus_metrics import focus_curve
from .intrinsics import CameraIntrinsics
from .report import DepthReport
from .scale import FocusDepthScale, calibrate_scale

DepthScaleCalibration = FocusDepthScale

__all__ = [
    "FocusFrame", "FocusStack", "FocusMetricCurve", "RelativeDepthMap",
    "DepthSample", "CameraIntrinsics", "FocusCalibration",
    "DepthScaleCalibration", "DepthResult", "DepthReport", "DefocusDepthError",
    "FocusDepthScale", "calibrate_scale", "estimate_relative_depth", "focus_curve",
]
