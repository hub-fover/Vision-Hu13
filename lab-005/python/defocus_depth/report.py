from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class DepthReport:
    status: str
    quality: str
    valid_fraction: float
    confidence_mean: float
    focus_curve: list[float]
    relative_depth_available: bool = True
    metric_depth_available: bool = False
    error_code: str | None = None
    diagnostics: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def make_report(result, curve, *, metric_depth_available: bool = False) -> DepthReport:
    confidence_mean = float(result.confidence[result.valid].mean()) if result.valid.any() else 0.0
    quality = "stable" if confidence_mean >= 0.70 else "reference-only" if confidence_mean >= 0.45 else "unstable"
    return DepthReport("ok", quality, float(result.valid.mean()), confidence_mean, list(map(float, curve)), metric_depth_available=metric_depth_available)
