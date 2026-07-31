"""Image decoding, orientation, and bounded resizing."""

from __future__ import annotations

from os import PathLike
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from .errors import FusionError


SUPPORTED_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})


def load_image(source: str | PathLike[str]) -> np.ndarray:
    path = Path(source)
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise FusionError("UNSUPPORTED_FORMAT", f"{path.name} must be JPEG, PNG, or WebP.")
    try:
        with Image.open(path) as opened:
            oriented = ImageOps.exif_transpose(opened)
            image = np.asarray(oriented.convert("RGB"), dtype=np.uint8)
    except (OSError, ValueError, UnidentifiedImageError) as error:
        raise FusionError("DECODE_FAILED", f"Could not decode {path.name}.") from error
    if image.ndim != 3 or image.shape[2] != 3 or not image.size:
        raise FusionError("DECODE_FAILED", f"{path.name} did not contain RGB pixels.")
    return np.ascontiguousarray(image)


def resize_to_pixel_cap(image: np.ndarray, max_pixels: int) -> tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    scale = min(1.0, (max_pixels / (height * width)) ** 0.5)
    if scale == 1.0:
        return image, scale
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return cv2.resize(image, size, interpolation=cv2.INTER_AREA), scale
