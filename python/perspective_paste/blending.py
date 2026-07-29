"""Perspective warping and environment-aware image compositing."""

from __future__ import annotations

from collections.abc import Mapping

import cv2
import numpy as np

from .renderer import (
    fit_asset,
    load_png_layer,
    premultiply_alpha,
    unpremultiply_alpha,
)


def _rgb_float(image: np.ndarray) -> np.ndarray:
    array = np.asarray(image)
    rgb = array[..., :3].astype(np.float32)
    if array.dtype != np.uint8 and rgb.size and np.nanmax(rgb) <= 1.0:
        return np.clip(rgb, 0.0, 1.0)
    return np.clip(rgb / 255.0, 0.0, 1.0)


def _to_uint8(rgb: np.ndarray) -> np.ndarray:
    return np.clip(np.rint(rgb * 255.0), 0, 255).astype(np.uint8)


def blend_mode(
    background: np.ndarray, source: np.ndarray, mode: str = "normal"
) -> np.ndarray:
    """Apply a separable W3C blend function to two RGB(A) images."""
    backdrop = _rgb_float(background)
    foreground = _rgb_float(source)
    if backdrop.shape != foreground.shape:
        raise ValueError("background and source RGB shapes must match")
    if mode == "normal":
        result = foreground
    elif mode == "multiply":
        result = backdrop * foreground
    elif mode == "soft-light":
        d = np.where(
            backdrop <= 0.25,
            ((16.0 * backdrop - 12.0) * backdrop + 4.0) * backdrop,
            np.sqrt(backdrop),
        )
        result = np.where(
            foreground <= 0.5,
            backdrop
            - (1.0 - 2.0 * foreground) * backdrop * (1.0 - backdrop),
            backdrop + (2.0 * foreground - 1.0) * (d - backdrop),
        )
    else:
        raise ValueError("mode must be normal, multiply, or soft-light")
    return _to_uint8(np.clip(result, 0.0, 1.0))


def _weights(source: np.ndarray, mask: np.ndarray | None) -> np.ndarray:
    if mask is None:
        if source.ndim == 3 and source.shape[2] == 4:
            result = source[..., 3].astype(np.float32) / 255.0
        else:
            result = np.ones(source.shape[:2], dtype=np.float32)
    else:
        result = np.asarray(mask, dtype=np.float32)
        if result.ndim == 3:
            result = result[..., 0]
        if result.size and result.max() > 1:
            result /= 255.0
    return np.clip(result, 0.0, 1.0)


def match_brightness(
    background: np.ndarray,
    source: np.ndarray,
    mask: np.ndarray | None = None,
    *,
    return_gain: bool = False,
) -> np.ndarray | tuple[np.ndarray, float]:
    """Match masked mean luminance with a gain clamped to ``[0.6, 1.4]``."""
    layer = load_png_layer(source)
    weights = _weights(layer, mask)
    total = float(weights.sum())
    if total <= np.finfo(np.float32).eps:
        gain = 1.0
    else:
        coefficients = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        source_luma = _rgb_float(layer) @ coefficients
        background_luma = _rgb_float(background) @ coefficients
        source_mean = float((source_luma * weights).sum() / total)
        background_mean = float((background_luma * weights).sum() / total)
        gain = float(np.clip(background_mean / max(source_mean, 1e-6), 0.6, 1.4))
    result = layer.copy()
    result[..., :3] = np.clip(
        np.rint(result[..., :3].astype(np.float32) * gain), 0, 255
    ).astype(np.uint8)
    return (result, gain) if return_gain else result


def apply_environment_tint(
    background: np.ndarray,
    source: np.ndarray,
    strength: float = 0.0,
    mask: np.ndarray | None = None,
) -> np.ndarray:
    """Blend source color toward the masked average background color."""
    layer = load_png_layer(source)
    amount = float(np.clip(strength, 0.0, 1.0))
    if amount == 0:
        return layer
    weights = _weights(layer, mask)
    total = float(weights.sum())
    if total <= np.finfo(np.float32).eps:
        return layer
    background_rgb = np.asarray(background)[..., :3].astype(np.float32)
    average = (background_rgb * weights[..., None]).sum(axis=(0, 1)) / total
    result = layer.copy()
    result[..., :3] = np.clip(
        np.rint(
            result[..., :3].astype(np.float32) * (1.0 - amount)
            + average * amount
        ),
        0,
        255,
    ).astype(np.uint8)
    return result


def apply_texture(
    background: np.ndarray,
    source: np.ndarray,
    texture_strength: float = 0.0,
    mask: np.ndarray | None = None,
) -> np.ndarray:
    """Modulate source RGB with high-frequency detail from the background."""
    layer = load_png_layer(source)
    strength = float(texture_strength)
    if strength == 0:
        return layer
    background_rgb = np.asarray(background)[..., :3].astype(np.float32)
    low_frequency = cv2.GaussianBlur(background_rgb, (0, 0), sigmaX=3.0)
    high_frequency = (background_rgb - low_frequency) / 127.5
    weights = _weights(layer, mask)[..., None]
    modulation = 1.0 + strength * high_frequency * weights
    result = layer.copy()
    result[..., :3] = np.clip(
        np.rint(result[..., :3].astype(np.float32) * modulation), 0, 255
    ).astype(np.uint8)
    return result


def make_shadow(
    source: np.ndarray,
    *,
    enabled: bool = True,
    offset_x: float = 8.0,
    offset_y: float = 8.0,
    blur: float = 12.0,
    opacity: float = 0.35,
) -> np.ndarray:
    """Return a canvas-sized black RGBA shadow from an already warped layer."""
    layer = load_png_layer(source)
    result = np.zeros_like(layer)
    if not enabled:
        return result
    height, width = layer.shape[:2]
    matrix = np.array([[1, 0, float(offset_x)], [0, 1, float(offset_y)]], dtype=np.float32)
    alpha = cv2.warpAffine(
        layer[..., 3],
        matrix,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    if float(blur) > 0:
        alpha = cv2.GaussianBlur(alpha, (0, 0), sigmaX=float(blur))
    result[..., 3] = np.clip(
        np.rint(alpha.astype(np.float32) * float(np.clip(opacity, 0.0, 1.0))),
        0,
        255,
    ).astype(np.uint8)
    return result


def warp_asset(
    asset: np.ndarray,
    quad: list[list[float]] | np.ndarray,
    canvas_size: tuple[int, int],
) -> np.ndarray:
    """Perspective-warp an RGBA layer to ``quad`` on a ``(width, height)`` canvas."""
    layer = load_png_layer(asset)
    width, height = (int(value) for value in canvas_size)
    if width <= 0 or height <= 0:
        raise ValueError("canvas_size dimensions must be positive")
    source_height, source_width = layer.shape[:2]
    source_points = np.array(
        [
            [0, 0],
            [source_width - 1, 0],
            [source_width - 1, source_height - 1],
            [0, source_height - 1],
        ],
        dtype=np.float32,
    )
    destination = np.asarray(quad, dtype=np.float32)
    if destination.shape != (4, 2) or not np.isfinite(destination).all():
        raise ValueError("quad must contain four finite x/y points")
    transform = cv2.getPerspectiveTransform(source_points, destination)
    return unpremultiply_alpha(
        cv2.warpPerspective(
            premultiply_alpha(layer),
            transform,
            (width, height),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0),
        )
    )


def _saturate(layer: np.ndarray, saturation: float) -> np.ndarray:
    amount = max(0.0, float(saturation))
    if amount == 1:
        return layer
    result = layer.copy()
    rgb = result[..., :3].astype(np.float32)
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    result[..., :3] = np.clip(
        np.rint(luminance[..., None] + (rgb - luminance[..., None]) * amount),
        0,
        255,
    ).astype(np.uint8)
    return result


def _alpha_over(backdrop: np.ndarray, foreground: np.ndarray) -> np.ndarray:
    """Straight-alpha source-over for same-sized uint8 RGBA arrays."""
    back = load_png_layer(backdrop).astype(np.float32) / 255.0
    front = load_png_layer(foreground).astype(np.float32) / 255.0
    source_alpha = front[..., 3:4]
    backdrop_alpha = back[..., 3:4]
    output_alpha = source_alpha + backdrop_alpha * (1.0 - source_alpha)
    premultiplied = (
        front[..., :3] * source_alpha
        + back[..., :3] * backdrop_alpha * (1.0 - source_alpha)
    )
    output_rgb = np.divide(
        premultiplied,
        output_alpha,
        out=np.zeros_like(premultiplied),
        where=output_alpha > 1e-8,
    )
    return np.clip(
        np.rint(np.concatenate([output_rgb, output_alpha], axis=2) * 255.0),
        0,
        255,
    ).astype(np.uint8)


def _quad_size(quad: np.ndarray) -> tuple[int, int]:
    top = np.linalg.norm(quad[1] - quad[0])
    bottom = np.linalg.norm(quad[2] - quad[3])
    left = np.linalg.norm(quad[3] - quad[0])
    right = np.linalg.norm(quad[2] - quad[1])
    return max(2, round((top + bottom) / 2)), max(2, round((left + right) / 2))


def blend_composite(
    background: np.ndarray,
    asset: np.ndarray,
    quad: list[list[float]] | np.ndarray,
    options: Mapping[str, object] | None = None,
) -> np.ndarray:
    """Run fit → warp → light/tint/blur/texture → shadow → blend → alpha."""
    settings = dict(options or {})
    original = np.asarray(background)
    had_alpha = original.ndim == 3 and original.shape[2] == 4
    backdrop = load_png_layer(original)
    height, width = backdrop.shape[:2]
    points = np.asarray(quad, dtype=np.float32)

    fitted = fit_asset(
        asset, _quad_size(points), str(settings.get("fitMode", "contain"))
    )
    warped = warp_asset(fitted, points, (width, height))
    mask = warped[..., 3]
    if bool(settings.get("brightnessMatch", True)):
        warped = match_brightness(backdrop, warped, mask)
    warped = apply_environment_tint(
        backdrop, warped, float(settings.get("tintStrength", 0.0)), mask
    )
    warped = _saturate(warped, float(settings.get("saturation", 1.0)))

    blur_px = float(settings.get("blurPx", 0.0)) * max(width, height) / 1080.0
    if blur_px > 0:
        warped = unpremultiply_alpha(
            cv2.GaussianBlur(
                premultiply_alpha(warped), (0, 0), sigmaX=blur_px
            )
        )
    warped = apply_texture(
        backdrop,
        warped,
        float(settings.get("textureStrength", 0.0)),
        warped[..., 3],
    )

    shadow_settings = settings.get("shadow", {})
    shadow_options = (
        dict(shadow_settings) if isinstance(shadow_settings, Mapping) else {}
    )
    shadow = make_shadow(
        warped,
        enabled=bool(shadow_options.get("enabled", False)),
        offset_x=float(shadow_options.get("offsetX", 8)),
        offset_y=float(shadow_options.get("offsetY", 8)),
        blur=float(shadow_options.get("blur", 12)),
        opacity=float(shadow_options.get("opacity", 0.35)),
    )
    composed = _alpha_over(backdrop, shadow)

    blended_rgb = blend_mode(
        composed[..., :3], warped[..., :3], str(settings.get("blendMode", "normal"))
    )
    blend_layer = np.dstack([blended_rgb, warped[..., 3]]).astype(np.uint8)
    opacity = float(np.clip(settings.get("opacity", 1.0), 0.0, 1.0))
    blend_layer[..., 3] = np.clip(
        np.rint(blend_layer[..., 3].astype(np.float32) * opacity), 0, 255
    ).astype(np.uint8)
    result = _alpha_over(composed, blend_layer)
    return result if had_alpha else result[..., :3]
