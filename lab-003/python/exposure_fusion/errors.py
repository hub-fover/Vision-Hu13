"""Stable actionable errors for the exposure-fusion pipeline."""

from .contracts import ERROR_CODES


class FusionError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        if code not in ERROR_CODES:
            raise ValueError(f"unknown LAB 003 error code: {code}")
        self.code = code
        self.message = message
        super().__init__(f"[{code}] {message}")
