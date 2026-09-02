from __future__ import annotations

from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image, ImageOps

from .errors import DefocusDepthError

SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def estimate_working_set(shape: tuple[int, int], frames: int = 5, channels: int = 4) -> int:
    """Conservative byte estimate for decoded float and grayscale stack."""
    height, width = shape[:2]
    return int(height * width * frames * (channels + 1) * 4)


def _pil_to_array(image: Image.Image) -> np.ndarray:
    image = ImageOps.exif_transpose(image).convert("RGB")
    return np.asarray(image)[:, :, ::-1].copy()


def load_image(path: str | Path, *, max_side: int = 1280) -> np.ndarray:
    path = Path(path)
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise DefocusDepthError("UNSUPPORTED_FORMAT")
    try:
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            scale = min(1.0, max_side / max(image.size))
            if scale < 1:
                image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
            return _pil_to_array(image)
    except DefocusDepthError:
        raise
    except Exception as exc:
        raise DefocusDepthError("DECODE_FAILED", str(exc)) from exc


def validate_stack(frames: Iterable[np.ndarray], *, input_count: int = 5, max_working_set_mib: int = 320) -> tuple[np.ndarray, ...]:
    frames = tuple(frames)
    if len(frames) != input_count:
        raise DefocusDepthError("INVALID_FRAME_COUNT")
    if any(not isinstance(frame, np.ndarray) or frame.ndim not in (2, 3) for frame in frames):
        raise DefocusDepthError("DECODE_FAILED")
    shapes = {frame.shape[:2] for frame in frames}
    if len(shapes) != 1:
        raise DefocusDepthError("INTRINSICS_MISMATCH", "All frames must have the same dimensions.")
    shape = next(iter(shapes))
    if estimate_working_set(shape, len(frames)) > max_working_set_mib * 1024 * 1024:
        raise DefocusDepthError("MEMORY_BUDGET_EXCEEDED")
    return frames


def load_stack(folder: str | Path, *, max_side: int = 1280) -> list[np.ndarray]:
    paths = sorted(p for p in Path(folder).iterdir() if p.suffix.lower() in SUPPORTED_SUFFIXES)
    frames = [load_image(path, max_side=max_side) for path in paths]
    return list(validate_stack(frames))


def write_png(path: str | Path, image: np.ndarray) -> None:
    path = Path(path)
    array = np.asarray(image)
    if array.dtype != np.uint8:
        array = np.clip(array * 255 if array.max(initial=0) <= 1 else array, 0, 255).astype(np.uint8)
    if not cv2.imwrite(str(path), array):
        raise DefocusDepthError("DECODE_FAILED", f"Cannot write {path}")
