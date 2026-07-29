"""Public API for the Perspective Paste teaching tool."""

from .blending import (
    apply_environment_tint,
    apply_texture,
    blend_composite,
    blend_mode,
    make_shadow,
    match_brightness,
    warp_asset,
)
from .geometry import (
    GeometryError,
    compute_homography,
    compute_vanishing_points,
    order_quad,
    validate_quad,
)
from .renderer import (
    crop_transparent,
    find_system_fonts,
    fit_asset,
    font_supports_text,
    load_png_layer,
    premultiply_alpha,
    render_text_layer,
    resolve_font,
    unpremultiply_alpha,
)

__all__ = [
    "GeometryError",
    "apply_environment_tint",
    "apply_texture",
    "blend_composite",
    "blend_mode",
    "compute_homography",
    "compute_vanishing_points",
    "crop_transparent",
    "find_system_fonts",
    "fit_asset",
    "font_supports_text",
    "load_png_layer",
    "make_shadow",
    "match_brightness",
    "order_quad",
    "premultiply_alpha",
    "render_text_layer",
    "resolve_font",
    "validate_quad",
    "unpremultiply_alpha",
    "warp_asset",
]
