"""Stable LAB 004 error definitions."""

from __future__ import annotations


ERROR_CODES = frozenset(
    {
        "INVALID_DIMENSIONS",
        "INVALID_QUAD",
        "TARGET_TOO_SMALL",
        "TARGET_CLIPPED",
        "LOW_CONTRAST",
        "LOW_TEXTURE",
        "INSUFFICIENT_VIEW_DIVERSITY",
        "CALIBRATION_FAILED",
        "INVALID_CALIBRATION_FILE",
        "INTRINSICS_MISMATCH",
        "POSE_FAILED",
        "POSE_AMBIGUOUS",
        "HIGH_REPROJECTION_ERROR",
        "TRACKING_LOST",
        "CAMERA_CHANGED",
        "PERMISSION_DENIED",
        "UNSUPPORTED_CAMERA",
        "CANCELLED",
    }
)


class CameraPoseError(ValueError):
    """A LAB 004 failure with a stable cross-runtime code."""

    def __init__(self, code: str, message: str | None = None):
        if code not in ERROR_CODES:
            raise ValueError(f"Unknown LAB 004 error code: {code}")
        self.code = code
        super().__init__(message or code)
