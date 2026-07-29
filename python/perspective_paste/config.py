"""Shared configuration loaded from the cross-runtime preset file."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class GeometryPreset:
    minimum_point_distance_pixels: float
    minimum_point_distance_diagonal_ratio: float
    minimum_area_pixels_squared: float
    minimum_area_canvas_ratio: float
    minimum_edge_ratio: float
    near_collinear_sine: float
    maximum_normalized_homography_condition: float
    maximum_reprojection_error_pixels: float
    parallel_line_epsilon: float


@dataclass(frozen=True)
class ShadowPreset:
    enabled: bool
    offset_x: float
    offset_y: float
    blur: float
    opacity: float

    def to_options(self) -> dict:
        return {
            "enabled": self.enabled,
            "offsetX": self.offset_x,
            "offsetY": self.offset_y,
            "blur": self.blur,
            "opacity": self.opacity,
        }


@dataclass(frozen=True)
class RenderPreset:
    blend_mode: str
    opacity: float
    blur_px: float
    brightness_match: bool
    tint_strength: float
    texture_strength: float
    saturation: float
    shadow: ShadowPreset
    fit_mode: str

    def to_options(self) -> dict:
        return {
            "blendMode": self.blend_mode,
            "opacity": self.opacity,
            "blurPx": self.blur_px,
            "brightnessMatch": self.brightness_match,
            "tintStrength": self.tint_strength,
            "textureStrength": self.texture_strength,
            "saturation": self.saturation,
            "shadow": self.shadow.to_options(),
            "fitMode": self.fit_mode,
        }


def _shared_path() -> Path:
    return Path(__file__).resolve().parents[2] / "shared" / "presets.json"


def load_presets(path: str | Path | None = None) -> dict:
    source = Path(path) if path is not None else _shared_path()
    return json.loads(source.read_text(encoding="utf-8"))


PRESETS = load_presets()
_GEOMETRY = PRESETS["geometry"]
GEOMETRY_PRESET = GeometryPreset(
    minimum_point_distance_pixels=_GEOMETRY["minimumPointDistancePixels"],
    minimum_point_distance_diagonal_ratio=_GEOMETRY[
        "minimumPointDistanceDiagonalRatio"
    ],
    minimum_area_pixels_squared=_GEOMETRY["minimumAreaPixelsSquared"],
    minimum_area_canvas_ratio=_GEOMETRY["minimumAreaCanvasRatio"],
    minimum_edge_ratio=_GEOMETRY["minimumEdgeRatio"],
    near_collinear_sine=_GEOMETRY["nearCollinearSine"],
    maximum_normalized_homography_condition=_GEOMETRY[
        "maximumNormalizedHomographyCondition"
    ],
    maximum_reprojection_error_pixels=_GEOMETRY[
        "maximumReprojectionErrorPixels"
    ],
    parallel_line_epsilon=_GEOMETRY["parallelLineEpsilon"],
)


def _render_preset(values: dict) -> RenderPreset:
    shadow = values["shadow"]
    return RenderPreset(
        blend_mode=values["blendMode"],
        opacity=values["opacity"],
        blur_px=values["blurPx"],
        brightness_match=values["brightnessMatch"],
        tint_strength=values["tintStrength"],
        texture_strength=values["textureStrength"],
        saturation=values["saturation"],
        shadow=ShadowPreset(
            enabled=shadow["enabled"],
            offset_x=shadow["offsetX"],
            offset_y=shadow["offsetY"],
            blur=shadow["blur"],
            opacity=shadow["opacity"],
        ),
        fit_mode=values["fitMode"],
    )


RENDER_PRESETS = {
    name: _render_preset(values) for name, values in PRESETS["presets"].items()
}


def get_render_preset(name: str) -> dict:
    """Return a mutable, independent camelCase options dictionary."""
    return RENDER_PRESETS[name].to_options()
