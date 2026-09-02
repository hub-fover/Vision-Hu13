"""Multi-resolution Laplacian-pyramid exposure fusion."""

from __future__ import annotations

from collections.abc import Sequence

import cv2
import numpy as np


def gaussian_pyramid(image: np.ndarray, levels: int) -> list[np.ndarray]:
    pyramid = [image.astype(np.float32)]
    for _ in range(1, levels):
        if min(pyramid[-1].shape[:2]) < 4:
            break
        pyramid.append(cv2.pyrDown(pyramid[-1]))
    return pyramid


def laplacian_pyramid(image: np.ndarray, levels: int) -> list[np.ndarray]:
    gaussian = gaussian_pyramid(image, levels)
    result = []
    for index in range(len(gaussian) - 1):
        expanded = cv2.pyrUp(
            gaussian[index + 1],
            dstsize=(gaussian[index].shape[1], gaussian[index].shape[0]),
        )
        result.append(gaussian[index] - expanded)
    result.append(gaussian[-1])
    return result


def reconstruct_laplacian(pyramid: Sequence[np.ndarray]) -> np.ndarray:
    image = pyramid[-1]
    for level in reversed(pyramid[:-1]):
        image = cv2.pyrUp(image, dstsize=(level.shape[1], level.shape[0])) + level
    return image


def fuse_pyramids(images: Sequence[np.ndarray], weights: np.ndarray, levels: int = 5) -> np.ndarray:
    image_pyramids = [laplacian_pyramid(image.astype(np.float32) / 255.0, levels) for image in images]
    weight_pyramids = [gaussian_pyramid(weight, levels) for weight in weights]
    count = min(len(pyramid) for pyramid in (*image_pyramids, *weight_pyramids))
    fused = []
    for level in range(count):
        accumulator = np.zeros_like(image_pyramids[0][level], dtype=np.float32)
        weight_sum = np.zeros(accumulator.shape[:2], dtype=np.float32)
        for image_pyramid, weight_pyramid in zip(image_pyramids, weight_pyramids, strict=True):
            level_weight = weight_pyramid[level]
            accumulator += image_pyramid[level] * level_weight[..., None]
            weight_sum += level_weight
        fused.append(accumulator / np.maximum(weight_sum[..., None], 1e-8))
    return np.clip(reconstruct_laplacian(fused), 0.0, 1.0)
