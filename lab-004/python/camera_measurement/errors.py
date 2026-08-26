"""Stable errors for the static-scene speed estimator."""

ERROR_CODES = {
    "INVALID_FRAME", "UNSUPPORTED_FORMAT", "DECODE_FAILED", "INVALID_SCALE",
    "TARGET_TOO_SMALL", "LOW_TEXTURE", "LOW_CONTRAST", "SCENE_CHANGED",
    "CAMERA_ROTATION_TOO_LARGE", "FLOW_LOST", "BACKGROUND_UNTRACKABLE",
    "FPS_UNSTABLE", "RUNTIME_MISSING", "PERMISSION_DENIED", "CANCELLED",
}


class MeasurementError(ValueError):
    """An expected input or tracking failure with a stable machine code."""

    def __init__(self, code: str, message: str | None = None):
        if code not in ERROR_CODES:
            raise ValueError(f"Unknown measurement error code: {code}")
        self.code = code
        super().__init__(f"{code}: {message or code}")
