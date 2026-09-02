"""Local frame/video loading, resizing and conservative memory checks."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from .contracts import ANALYSIS_MAX_SIDE, MAX_WORKING_SET_MIB
from .errors import MeasurementError

SUPPORTED_IMAGE_FORMATS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
SUPPORTED_VIDEO_FORMATS = {".mp4", ".webm", ".mov", ".avi", ".mkv"}


@dataclass(frozen=True)
class FrameSequence:
    frames: list[np.ndarray]
    timestamps_s: np.ndarray
    fps: float
    image_size_px: tuple[int, int]


def prepare_frame(frame: np.ndarray, max_side: int = ANALYSIS_MAX_SIDE) -> np.ndarray:
    if frame is None or not isinstance(frame, np.ndarray) or frame.ndim not in (2, 3) or frame.shape[0] < 1 or frame.shape[1] < 1:
        raise MeasurementError("INVALID_FRAME", "Frame must contain a non-empty image.")
    if frame.dtype != np.uint8:
        frame = np.clip(frame, 0, 255).astype(np.uint8)
    h, w = frame.shape[:2]
    scale = min(1.0, float(max_side) / max(w, h))
    if scale < 1.0:
        frame = cv2.resize(frame, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_AREA)
    return np.ascontiguousarray(frame)


def validate_memory(frame_count: int, image_size_px: tuple[int, int], channels: int = 1, max_working_set_mib: int = MAX_WORKING_SET_MIB) -> None:
    try:
        count, width, height, channel_count = int(frame_count), int(image_size_px[0]), int(image_size_px[1]), int(channels)
    except (TypeError, ValueError, IndexError) as exc:
        raise MeasurementError("INVALID_FRAME", "Frame dimensions are invalid.") from exc
    if count <= 0 or width <= 0 or height <= 0 or channel_count <= 0:
        raise MeasurementError("INVALID_FRAME", "Frame dimensions are invalid.")
    estimate = count * width * height * channel_count * 2  # image + working copy
    if estimate > max_working_set_mib * 1024 * 1024:
        raise MeasurementError("INVALID_FRAME", "Input sequence exceeds the working set.")


def load_image(path: str | Path, max_side: int = ANALYSIS_MAX_SIDE) -> np.ndarray:
    path = Path(path)
    if path.suffix.lower() not in SUPPORTED_IMAGE_FORMATS:
        raise MeasurementError("UNSUPPORTED_FORMAT", f"Unsupported image format: {path.suffix}")
    try:
        with Image.open(path) as opened:
            rgb = ImageOps.exif_transpose(opened).convert("RGB")
            array = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)
    except (OSError, UnidentifiedImageError) as exc:
        raise MeasurementError("DECODE_FAILED", f"Cannot decode {path.name}") from exc
    return prepare_frame(array, max_side)


def load_frame_directory(path: str | Path, fps: float = 30.0, max_side: int = ANALYSIS_MAX_SIDE) -> FrameSequence:
    directory = Path(path)
    if not directory.is_dir():
        raise MeasurementError("DECODE_FAILED", "Frame directory does not exist.")
    paths = sorted(p for p in directory.iterdir() if p.suffix.lower() in SUPPORTED_IMAGE_FORMATS)
    if not paths:
        raise MeasurementError("DECODE_FAILED", "Frame directory has no supported images.")
    frames = [load_image(p, max_side) for p in paths]
    h, w = frames[0].shape[:2]
    if any(frame.shape[:2] != (h, w) for frame in frames):
        raise MeasurementError("SCENE_CHANGED", "All frames must have the same dimensions.")
    validate_memory(len(frames), (w, h), frames[0].shape[2] if frames[0].ndim == 3 else 1)
    rate = _validate_fps(fps)
    return FrameSequence(frames, np.arange(len(frames), dtype=np.float64) / rate, rate, (w, h))


def load_video(path: str | Path, max_side: int = ANALYSIS_MAX_SIDE, max_frames: int | None = None) -> FrameSequence:
    path = Path(path)
    if path.suffix.lower() not in SUPPORTED_VIDEO_FORMATS:
        raise MeasurementError("UNSUPPORTED_FORMAT", f"Unsupported video format: {path.suffix}")
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise MeasurementError("DECODE_FAILED", f"Cannot open video {path.name}")
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    if not np.isfinite(fps) or fps <= 0:
        fps = 30.0
    frames: list[np.ndarray] = []
    timestamps: list[float] = []
    try:
        while max_frames is None or len(frames) < max_frames:
            ok, frame = capture.read()
            if not ok:
                break
            frames.append(prepare_frame(frame, max_side))
            position_ms = float(capture.get(cv2.CAP_PROP_POS_MSEC))
            timestamps.append(position_ms / 1000.0 if position_ms > 0 else (len(frames) - 1) / fps)
    finally:
        capture.release()
    if not frames:
        raise MeasurementError("DECODE_FAILED", "Video has no decodable frames.")
    h, w = frames[0].shape[:2]
    if any(frame.shape[:2] != (h, w) for frame in frames):
        raise MeasurementError("SCENE_CHANGED", "Video frame dimensions changed.")
    validate_memory(len(frames), (w, h), frames[0].shape[2] if frames[0].ndim == 3 else 1)
    return FrameSequence(frames, np.asarray(timestamps, dtype=np.float64), fps, (w, h))


def load_source(source: str | Path, fps: float = 30.0, max_side: int = ANALYSIS_MAX_SIDE) -> FrameSequence:
    path = Path(source)
    if path.is_dir():
        return load_frame_directory(path, fps, max_side)
    return load_video(path, max_side)


def _validate_fps(fps: float) -> float:
    try:
        value = float(fps)
    except (TypeError, ValueError, OverflowError) as exc:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be positive.") from exc
    if not np.isfinite(value) or value <= 0:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be positive.")
    return value

