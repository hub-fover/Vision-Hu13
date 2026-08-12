from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .errors import DefocusDepthError


@dataclass
class FocusFrame:
    image: np.ndarray
    focus_index: float
    source: str | None = None


@dataclass
class FocusStack:
    frames: tuple[FocusFrame, ...]

    def __post_init__(self) -> None:
        if len(self.frames) != 5:
            raise DefocusDepthError("INVALID_FRAME_COUNT")


@dataclass
class FocusMetricCurve:
    scores: np.ndarray
    peak_index: float
    prominence: float


@dataclass
class RelativeDepthMap:
    depth: np.ndarray
    confidence: np.ndarray
    invalid: np.ndarray


@dataclass
class DepthSample:
    x: int
    y: int
    relative_depth: float
    confidence: float
    metric_depth_m: float | None = None


@dataclass
class FocusCalibration:
    focus_indices: list[float]
    lens_id: str | None = None
    image_size: tuple[int, int] | None = None
    orientation: int | None = None
    zoom: float | None = None
    diagnostics: dict = field(default_factory=dict)
