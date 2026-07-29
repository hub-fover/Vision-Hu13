"""Image decoding and analysis-scale preparation."""

from __future__ import annotations

from os import PathLike
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from .errors import StitchError


SUPPORTED_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})


def load_image(source: str | PathLike[str]) -> np.ndarray:
    """Decode a supported image as EXIF-oriented RGB uint8 pixels."""

    path = Path(source)
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise StitchError(
            "UNSUPPORTED_FORMAT",
            f"{path.name} is not supported; use JPEG, PNG, or WebP.",
        )
    try:
        with Image.open(path) as opened:
            oriented = ImageOps.exif_transpose(opened)
            image = np.asarray(oriented.convert("RGB"), dtype=np.uint8)
    except (OSError, ValueError, UnidentifiedImageError) as error:
        raise StitchError(
            "DECODE_FAILED",
            f"Could not decode {path.name}; verify that the file is a valid image.",
        ) from error
    if image.ndim != 3 or image.shape[2] != 3 or not image.size:
        raise StitchError("DECODE_FAILED", f"{path.name} did not contain RGB pixels.")
    return np.ascontiguousarray(image)


def resize_for_analysis(
    image: np.ndarray,
    *,
    max_side: int = 1280,
) -> tuple[np.ndarray, float]:
    """Downsample for feature analysis without ever enlarging the input."""

    if image.ndim not in (2, 3) or min(image.shape[:2]) <= 0:
        raise ValueError("image must have non-empty height and width")
    if max_side <= 0:
        raise ValueError("max_side must be positive")
    height, width = image.shape[:2]
    scale = min(1.0, max_side / max(height, width))
    if scale == 1.0:
        return image, scale
    resized = cv2.resize(
        image,
        (max(1, round(width * scale)), max(1, round(height * scale))),
        interpolation=cv2.INTER_AREA,
    )
    return resized, scale
