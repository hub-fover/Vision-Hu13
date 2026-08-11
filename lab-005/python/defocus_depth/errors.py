class DefocusDepthError(ValueError):
    """A user-actionable failure with one stable contract error code."""

    def __init__(self, code: str, message: str | None = None):
        self.code = code
        super().__init__(message or code)


ERROR_MESSAGES = {
    "INVALID_FRAME_COUNT": "Exactly five focus frames are required.",
    "UNSUPPORTED_FORMAT": "Use a JPEG, PNG, or WebP image.",
    "DECODE_FAILED": "The image could not be decoded.",
    "CAMERA_MOVED": "The camera moved between focus frames.",
    "SCENE_CHANGED": "The scene changed between focus frames.",
    "FOCUS_SPREAD_TOO_SMALL": "The focus settings are too similar.",
    "LOW_TEXTURE": "There is not enough texture to estimate focus.",
    "LOW_PEAK_PROMINENCE": "Focus response does not have a clear peak.",
    "ALIGNMENT_FAILED": "Focus frames could not be aligned.",
    "CALIBRATION_FAILED": "Camera calibration failed.",
    "DEPTH_SCALE_UNCALIBRATED": "No focus-to-distance scale calibration is available.",
    "INTRINSICS_MISMATCH": "Calibration does not match this image.",
    "MEMORY_BUDGET_EXCEEDED": "The image stack exceeds the working-memory budget.",
}
