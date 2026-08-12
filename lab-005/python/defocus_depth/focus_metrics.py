from __future__ import annotations

import cv2
import numpy as np

from .errors import DefocusDepthError


def _gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image.astype(np.float32) / 255.0
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0


def tenengrad(image: np.ndarray) -> float:
    gray = _gray(image)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    return float(np.mean(gx * gx + gy * gy))


def laplacian_variance(image: np.ndarray) -> float:
    return float(np.var(cv2.Laplacian(_gray(image), cv2.CV_32F)))


def texture_strength(image: np.ndarray, tile_size: int = 8) -> float:
    gray = _gray(image)
    # Mean local gradient magnitude, normalised to a useful [0, 1] scale.
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    return float(np.clip(np.mean(np.sqrt(gx * gx + gy * gy)) * 2.5, 0, 1))


def local_tenengrad(image: np.ndarray, tile_size: int = 8) -> np.ndarray:
    gray = _gray(image)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    score = gx * gx + gy * gy
    h, w = score.shape
    gh, gw = h // tile_size, w // tile_size
    if gh < 1 or gw < 1:
        return np.array([[float(score.mean())]], dtype=np.float32)
    trimmed = score[: gh * tile_size, : gw * tile_size]
    return trimmed.reshape(gh, tile_size, gw, tile_size).mean(axis=(1, 3)).astype(np.float32)


def focus_curve(frames: list[np.ndarray] | tuple[np.ndarray, ...], *, metric: str = "tenengrad") -> np.ndarray:
    if len(frames) != 5:
        raise DefocusDepthError("INVALID_FRAME_COUNT")
    fn = {"tenengrad": tenengrad, "laplacian": laplacian_variance}.get(metric)
    if fn is None:
        raise ValueError(f"unknown focus metric: {metric}")
    values = np.asarray([fn(frame) for frame in frames], dtype=np.float32)
    spread = float(values.max() - values.min())
    scale = max(float(values.max()), 1e-8)
    if spread / scale < 0.08:
        raise DefocusDepthError("FOCUS_SPREAD_TOO_SMALL")
    return values


def local_focus_scores(frames: list[np.ndarray] | tuple[np.ndarray, ...], tile_size: int = 8) -> np.ndarray:
    if len(frames) != 5:
        raise DefocusDepthError("INVALID_FRAME_COUNT")
    maps = [local_tenengrad(frame, tile_size) for frame in frames]
    shape = maps[0].shape
    if any(m.shape != shape for m in maps):
        raise DefocusDepthError("INTRINSICS_MISMATCH")
    scores = np.stack(maps).astype(np.float32)
    spread = np.ptp(scores, axis=0)
    scale = np.maximum(np.max(scores, axis=0), 1e-8)
    if float(np.mean(spread / scale)) < 0.08:
        raise DefocusDepthError("FOCUS_SPREAD_TOO_SMALL")
    return scores
