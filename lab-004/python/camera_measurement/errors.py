"""Stable errors for the LAB 004 measurement pipeline."""

ERROR_CODES = {
    "INVALID_FRAME", "UNSUPPORTED_FORMAT", "DECODE_FAILED", "INVALID_SCALE",
    "TARGET_TOO_SMALL", "LOW_TEXTURE", "LOW_CONTRAST", "TEMPLATE_LOST",
    "CAMERA_MOVED", "BACKGROUND_UNTRACKABLE", "SCENE_CHANGED", "FPS_UNSTABLE",
    "INSUFFICIENT_SAMPLES", "RUNTIME_MISSING", "PERMISSION_DENIED", "CANCELLED",
}


class MeasurementError(ValueError):
    """An expected user/input failure with a stable machine-readable code."""

    def __init__(self, code: str, message: str | None = None):
        if code not in ERROR_CODES:
            raise ValueError(f"Unknown measurement error code: {code}")
        self.code = code
        super().__init__(f"{code}: {message or code}")

