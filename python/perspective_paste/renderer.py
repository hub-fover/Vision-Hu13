"""Create RGBA text and image layers without opening a GUI."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
from PIL import Image, ImageColor, ImageDraw, ImageFont


FONT_CANDIDATES = (
    "Microsoft YaHei",
    "PingFang SC",
    "Noto Sans CJK",
    "DejaVu Sans",
)

_FONT_FILENAMES = (
    "msyh.ttc",
    "msyh.ttf",
    "PingFang.ttc",
    "NotoSansCJK-Regular.ttc",
    "NotoSansCJKsc-Regular.otf",
    "DejaVuSans.ttf",
)


def find_system_fonts() -> list[Path]:
    """Return installed fallback fonts in preferred order."""
    roots = [
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts",
        Path("/System/Library/Fonts"),
        Path("/Library/Fonts"),
        Path("/usr/share/fonts"),
        Path("/usr/local/share/fonts"),
    ]
    found: list[Path] = []
    for filename in _FONT_FILENAMES:
        for root in roots:
            direct = root / filename
            if direct.is_file():
                found.append(direct)
                break
            if root.is_dir():
                matches = list(root.glob(f"**/{filename}"))
                if matches:
                    found.append(matches[0])
                    break
    try:
        bundled = Path(ImageFont.truetype("DejaVuSans.ttf", 12).path)
        if bundled.is_file():
            found.append(bundled)
    except OSError:
        pass
    return list(dict.fromkeys(path.resolve() for path in found))


def _font_error(path: str | Path | None = None) -> FileNotFoundError:
    requested = f"Font not found: {path}. " if path is not None else ""
    candidates = ", ".join(FONT_CANDIDATES)
    return FileNotFoundError(
        f"{requested}Tried fallback candidates: {candidates}. "
        "Pass an installed .ttf/.otf/.ttc file with --font."
    )


def _glyph_signature(font: ImageFont.FreeTypeFont, character: str) -> tuple:
    mask = font.getmask(character, mode="L")
    return mask.size, mask.getbbox(), bytes(mask)


def font_supports_text(path: str | Path, text: str) -> bool:
    """Detect whether a font has real glyphs rather than only ``.notdef`` boxes."""
    try:
        font = ImageFont.truetype(str(path), 32)
    except OSError:
        return False
    missing = {
        _glyph_signature(font, "\u0378"),
        _glyph_signature(font, "\U0010ffff"),
    }
    return all(
        character.isspace() or _glyph_signature(font, character) not in missing
        for character in text
    )


def _coverage_error(path: str | Path, text: str) -> ValueError:
    candidates = ", ".join(FONT_CANDIDATES)
    sample = "".join(dict.fromkeys(character for character in text if not character.isspace()))
    return ValueError(
        f"Font {path} does not cover required text {sample!r}. "
        f"Try a CJK font: {candidates}."
    )


def resolve_font(path: str | Path | None = None, text: str | None = None) -> Path:
    """Resolve an explicit font or the first fallback covering the requested text."""
    if path is not None:
        result = Path(path).expanduser()
        if result.is_file():
            try:
                ImageFont.truetype(str(result), 12)
            except OSError as error:
                raise _font_error(path) from error
            if text and not font_supports_text(result, text):
                raise _coverage_error(result, text)
            return result.resolve()
        raise _font_error(path)
    fonts = find_system_fonts()
    if not fonts:
        raise _font_error()
    if text:
        fonts = [candidate for candidate in fonts if font_supports_text(candidate, text)]
        if not fonts:
            raise _coverage_error("system fallback fonts", text)
    return fonts[0]


def _rgba(color: str | Sequence[int], opacity: float = 1.0) -> tuple[int, int, int, int]:
    rgb = ImageColor.getrgb(color) if isinstance(color, str) else tuple(color)
    if len(rgb) == 4:
        rgb = rgb[:3]
    alpha = round(255 * float(np.clip(opacity, 0.0, 1.0)))
    return int(rgb[0]), int(rgb[1]), int(rgb[2]), alpha


def render_text_layer(
    text: str,
    font_path: str | Path | None = None,
    font_size: int = 96,
    color: str | Sequence[int] = (255, 255, 255),
    opacity: float = 1.0,
    stroke_width: int = 0,
    stroke_fill: str | Sequence[int] = (0, 0, 0),
    letter_spacing: int = 0,
    line_spacing: int = 0,
    vertical: bool = False,
) -> np.ndarray:
    """Render text into a tightly cropped uint8 RGBA layer."""
    font = ImageFont.truetype(
        str(resolve_font(font_path, text=text)), int(font_size)
    )
    lines = text.splitlines() or [""]
    if vertical:
        lines = [character for line in lines for character in (line or " ")]
    probe = Image.new("RGBA", (1, 1))
    draw = ImageDraw.Draw(probe)

    layouts: list[tuple[list[str], list[float], int, int]] = []
    for line in lines:
        glyphs = list(line) or [" "]
        boxes = [
            draw.textbbox(
                (0, 0), glyph, font=font, stroke_width=max(0, int(stroke_width))
            )
            for glyph in glyphs
        ]
        advances = [float(draw.textlength(glyph, font=font)) for glyph in glyphs]
        width = max(
            1,
            int(
                np.ceil(
                    sum(advances)
                    + max(0, len(glyphs) - 1) * int(letter_spacing)
                    + 2 * max(0, int(stroke_width))
                )
            ),
        )
        height = max(1, max(box[3] - box[1] for box in boxes))
        layouts.append((glyphs, advances, width, height))

    canvas_width = max(item[2] for item in layouts)
    canvas_height = sum(item[3] for item in layouts) + max(
        0, len(layouts) - 1
    ) * int(line_spacing)
    canvas = Image.new("RGBA", (max(1, canvas_width), max(1, canvas_height)))
    draw = ImageDraw.Draw(canvas)
    fill = _rgba(color, opacity)
    stroke = _rgba(stroke_fill, opacity)
    y = 0
    for glyphs, advances, _, height in layouts:
        x = max(0, int(stroke_width))
        for glyph, advance in zip(glyphs, advances):
            bbox = draw.textbbox(
                (0, 0), glyph, font=font, stroke_width=max(0, int(stroke_width))
            )
            draw.text(
                (x, y - bbox[1]),
                glyph,
                font=font,
                fill=fill,
                stroke_width=max(0, int(stroke_width)),
                stroke_fill=stroke,
            )
            x += advance + int(letter_spacing)
        y += height + int(line_spacing)
    return crop_transparent(np.asarray(canvas))


def _as_uint8(array: np.ndarray) -> np.ndarray:
    result = np.asarray(array)
    if result.dtype == np.uint8:
        return result.copy()
    result = result.astype(np.float32)
    if result.size and np.nanmax(result) <= 1.0:
        result *= 255.0
    return np.nan_to_num(result, nan=0.0, posinf=255.0, neginf=0.0).clip(
        0, 255
    ).astype(np.uint8)


def load_png_layer(source: str | Path | np.ndarray | Image.Image) -> np.ndarray:
    """Load an image as RGBA, adding fully opaque alpha when absent."""
    if isinstance(source, (str, Path)):
        with Image.open(source) as opened:
            image = np.asarray(opened.convert("RGBA"))
        return image.copy()
    if isinstance(source, Image.Image):
        return np.asarray(source.convert("RGBA")).copy()
    image = _as_uint8(np.asarray(source))
    if image.ndim == 2:
        image = np.repeat(image[..., None], 3, axis=2)
    if image.ndim != 3 or image.shape[2] not in (1, 2, 3, 4):
        raise ValueError("Asset must be a grayscale, RGB, or RGBA image")
    if image.shape[2] == 1:
        image = np.repeat(image, 3, axis=2)
    elif image.shape[2] == 2:
        image = np.concatenate([np.repeat(image[..., :1], 3, axis=2), image[..., 1:]], axis=2)
    if image.shape[2] == 3:
        alpha = np.full((*image.shape[:2], 1), 255, dtype=np.uint8)
        image = np.concatenate([image, alpha], axis=2)
    return image


def premultiply_alpha(asset: np.ndarray) -> np.ndarray:
    """Convert uint8 straight-alpha RGBA into normalized premultiplied RGBA."""
    layer = load_png_layer(asset).astype(np.float32) / 255.0
    layer[..., :3] *= layer[..., 3:4]
    return layer


def unpremultiply_alpha(asset: np.ndarray) -> np.ndarray:
    """Convert normalized premultiplied RGBA back to uint8 straight alpha."""
    premultiplied = np.asarray(asset, dtype=np.float32)
    if premultiplied.ndim != 3 or premultiplied.shape[2] != 4:
        raise ValueError("Premultiplied asset must be RGBA")
    alpha = np.clip(premultiplied[..., 3:4], 0.0, 1.0)
    rgb = np.divide(
        premultiplied[..., :3],
        alpha,
        out=np.zeros_like(premultiplied[..., :3]),
        where=alpha > 1e-8,
    )
    return np.clip(
        np.rint(np.concatenate([rgb, alpha], axis=2) * 255.0), 0, 255
    ).astype(np.uint8)


def fit_asset(
    asset: str | Path | np.ndarray | Image.Image,
    target_size: tuple[int, int],
    fit_mode: str = "contain",
) -> np.ndarray:
    """Aspect-fit an RGBA asset into ``(width, height)``."""
    if fit_mode not in {"fill", "contain"}:
        raise ValueError("fit_mode must be fill or contain")
    width, height = (int(value) for value in target_size)
    if width <= 0 or height <= 0:
        raise ValueError("target_size dimensions must be positive")
    layer = load_png_layer(asset)
    source_height, source_width = layer.shape[:2]
    scale = (
        max(width / source_width, height / source_height)
        if fit_mode == "fill"
        else min(width / source_width, height / source_height)
    )
    resized_width = max(1, round(source_width * scale))
    resized_height = max(1, round(source_height * scale))
    interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4
    resized = unpremultiply_alpha(
        cv2.resize(
            premultiply_alpha(layer),
            (resized_width, resized_height),
            interpolation=interpolation,
        )
    )
    if fit_mode == "fill":
        left = max(0, (resized_width - width) // 2)
        top = max(0, (resized_height - height) // 2)
        return resized[top : top + height, left : left + width].copy()
    output = np.zeros((height, width, 4), dtype=np.uint8)
    left = (width - resized_width) // 2
    top = (height - resized_height) // 2
    output[top : top + resized_height, left : left + resized_width] = resized
    return output


def crop_transparent(asset: np.ndarray) -> np.ndarray:
    """Crop transparent margins, retaining the original shape if fully transparent."""
    layer = load_png_layer(asset)
    nonzero = np.argwhere(layer[..., 3] > 0)
    if not nonzero.size:
        return layer
    top, left = nonzero.min(axis=0)
    bottom, right = nonzero.max(axis=0) + 1
    return layer[top:bottom, left:right].copy()
