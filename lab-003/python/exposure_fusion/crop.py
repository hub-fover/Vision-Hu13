"""Largest hole-free common crop for aligned exposures."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from .contracts import CropRect
from .errors import FusionError


def _largest_rectangle(mask: np.ndarray) -> CropRect:
    heights = np.zeros(mask.shape[1], dtype=np.int32)
    best = CropRect(0, 0, 0, 0)
    for row in range(mask.shape[0]):
        heights = np.where(mask[row], heights + 1, 0)
        stack: list[tuple[int, int]] = []
        for column in range(mask.shape[1] + 1):
            height = int(heights[column]) if column < mask.shape[1] else 0
            start = column
            while stack and stack[-1][1] > height:
                index, previous_height = stack.pop()
                area = previous_height * (column - index)
                if area > best.width * best.height:
                    best = CropRect(index, row - previous_height + 1, column - index, previous_height)
                start = index
            if not stack or stack[-1][1] < height:
                stack.append((start, height))
    return best


def crop_common_region(
    masks: Sequence[np.ndarray],
    *,
    inset: int = 2,
    maximum_loss: float = 0.20,
) -> CropRect:
    if len(masks) != 3:
        raise FusionError("INVALID_IMAGE_COUNT", "Three validity masks are required.")
    common = np.logical_and.reduce([mask > 0 for mask in masks])
    rect = _largest_rectangle(common)
    rect = CropRect(
        rect.x + inset,
        rect.y + inset,
        max(0, rect.width - inset * 2),
        max(0, rect.height - inset * 2),
    )
    total = common.shape[0] * common.shape[1]
    if rect.width <= 0 or rect.height <= 0 or rect.width * rect.height < total * (1 - maximum_loss):
        raise FusionError("EXCESSIVE_CROP", "Alignment would discard more than 20% of the frame.")
    return rect
