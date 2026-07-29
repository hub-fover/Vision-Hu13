"""Canvas estimation, perspective warping, feathering, and safe cropping."""

from __future__ import annotations

from dataclasses import dataclass
from math import floor, sqrt
from typing import Sequence

import cv2
import numpy as np

from .contracts import StitchOptions
from .errors import StitchError


@dataclass(frozen=True)
class WarpResult:
    """Warped RGB layers and their validity masks on a shared canvas."""

    images: tuple[np.ndarray, ...]
    masks: tuple[np.ndarray, ...]
    canvas_size: tuple[int, int]
    transforms: tuple[np.ndarray, ...]
    output_scale: float
    estimated_working_set_mib: float


@dataclass(frozen=True)
class CanvasPlan:
    """Allocation-safe output geometry shared by planning and warping."""

    canvas_size: tuple[int, int]
    transforms: tuple[np.ndarray, ...]
    output_scale: float
    canvas_bytes_per_pixel: int
    estimated_working_set_bytes: int
    estimated_working_set_mib: float


@dataclass(frozen=True)
class BlendResult:
    """Feathered RGB image plus diagnostics used by the teaching UI."""

    image: np.ndarray
    valid_mask: np.ndarray
    seam_mask: np.ndarray
    exposure_gains: tuple[float, ...]


@dataclass(frozen=True)
class CropRect:
    """Integer half-open crop rectangle."""

    x: int
    y: int
    width: int
    height: int

    @property
    def right(self) -> int:
        return self.x + self.width

    @property
    def bottom(self) -> int:
        return self.y + self.height

    def apply(self, image: np.ndarray) -> np.ndarray:
        return image[self.y : self.bottom, self.x : self.right]


def _shape_corners(
    image_shape: tuple[int, int],
    transform: np.ndarray,
) -> np.ndarray:
    height, width = image_shape
    corners = np.asarray(
        [[[0, 0], [width, 0], [width, height], [0, height]]],
        dtype=np.float64,
    )
    transformed = cv2.perspectiveTransform(corners, transform)[0]
    if not np.isfinite(transformed).all():
        raise StitchError(
            "HOMOGRAPHY_UNSTABLE",
            "A composed transform produced non-finite output bounds.",
        )
    return transformed


def plan_canvas(
    image_shapes: Sequence[tuple[int, int]],
    transforms: Sequence[np.ndarray],
    *,
    options: StitchOptions | None = None,
    quality: str = "mobile",
) -> CanvasPlan:
    """Plan a megapixel-capped canvas, downscaling further to fit memory."""

    selected = options or StitchOptions()
    if not image_shapes or len(image_shapes) != len(transforms):
        raise ValueError(
            "image_shapes and transforms must have the same non-zero length"
        )
    if quality not in {"mobile", "hd"}:
        raise ValueError("quality must be 'mobile' or 'hd'")
    normalized = tuple(np.asarray(item, dtype=np.float64) for item in transforms)
    corners = np.concatenate(
        [
            _shape_corners(image_shape, transform)
            for image_shape, transform in zip(image_shapes, normalized)
        ]
    )
    minimum = np.floor(np.min(corners, axis=0))
    maximum = np.ceil(np.max(corners, axis=0))
    base_width = max(1, int(maximum[0] - minimum[0]))
    base_height = max(1, int(maximum[1] - minimum[1]))
    megapixel_limit = (
        selected.mobile_output_megapixels
        if quality == "mobile"
        else selected.hd_output_megapixels
    )
    pixel_limit = megapixel_limit * 1_000_000
    output_scale = min(1.0, sqrt(pixel_limit / (base_width * base_height)))
    output_scale = min(
        output_scale,
        32766 / base_width,
        32766 / base_height,
    )
    source_bytes = sum(height * width * 3 for height, width in image_shapes)
    analysis_bytes = 0
    for height, width in image_shapes:
        analysis_scale = min(1.0, selected.analysis_max_side / max(height, width))
        analysis_bytes += (
            max(1, round(height * analysis_scale))
            * max(1, round(width * analysis_scale))
            * 3
        )
    feature_overhead_bytes = len(image_shapes) * 1024 * 1024
    fixed_bytes = source_bytes + analysis_bytes + feature_overhead_bytes
    # 4N retains every RGB warp and mask. The 64-byte blend allowance covers
    # accumulators, coverage, binary/distance/weight masks, float RGB
    # temporaries, and the larger boolean-indexed finalization peak.
    canvas_bytes_per_pixel = 64 + 4 * len(image_shapes)
    budget_bytes = selected.max_working_set_mib * 1024 * 1024
    requested_pixels = (
        max(1, floor(base_width * output_scale))
        * max(1, floor(base_height * output_scale))
    )
    requested_working_bytes = (
        fixed_bytes + requested_pixels * canvas_bytes_per_pixel
    )
    if requested_working_bytes > budget_bytes:
        available_pixels = floor(
            (budget_bytes - fixed_bytes) / canvas_bytes_per_pixel
        )
        if available_pixels < 256:
            raise StitchError(
                "OUTPUT_TOO_LARGE",
                (
                    "The source and analysis images alone exceed the "
                    f"{selected.max_working_set_mib} MiB working set; "
                    "use smaller inputs."
                ),
            )
        output_scale = min(
            output_scale,
            sqrt(available_pixels / (base_width * base_height)),
        )
    canvas_width = max(1, floor(base_width * output_scale))
    canvas_height = max(1, floor(base_height * output_scale))
    canvas_pixels = canvas_width * canvas_height
    working_bytes = fixed_bytes + canvas_pixels * canvas_bytes_per_pixel
    working_mib = working_bytes / (1024 * 1024)
    if working_mib > selected.max_working_set_mib:
        raise StitchError(
            "OUTPUT_TOO_LARGE",
            (
                f"Estimated working set is {working_mib:.1f} MiB, above the "
                f"{selected.max_working_set_mib} MiB limit; use smaller inputs."
            ),
        )
    translate = np.asarray(
        [[1, 0, -minimum[0]], [0, 1, -minimum[1]], [0, 0, 1]],
        dtype=np.float64,
    )
    scale = np.asarray(
        [[output_scale, 0, 0], [0, output_scale, 0], [0, 0, 1]],
        dtype=np.float64,
    )
    canvas_transforms = tuple(scale @ translate @ item for item in normalized)
    return CanvasPlan(
        canvas_size=(canvas_width, canvas_height),
        transforms=canvas_transforms,
        output_scale=output_scale,
        canvas_bytes_per_pixel=canvas_bytes_per_pixel,
        estimated_working_set_bytes=working_bytes,
        estimated_working_set_mib=working_mib,
    )


def warp_images(
    images: Sequence[np.ndarray],
    transforms: Sequence[np.ndarray],
    *,
    options: StitchOptions | None = None,
    quality: str = "mobile",
) -> WarpResult:
    """Estimate a bounded canvas and warp every source into it."""

    if not images or len(images) != len(transforms):
        raise ValueError("images and transforms must have the same non-zero length")
    plan = plan_canvas(
        [image.shape[:2] for image in images],
        transforms,
        options=options,
        quality=quality,
    )
    canvas_width, canvas_height = plan.canvas_size
    warped_images: list[np.ndarray] = []
    masks: list[np.ndarray] = []
    for image, transform in zip(images, plan.transforms):
        warped_images.append(
            cv2.warpPerspective(
                image,
                transform,
                (canvas_width, canvas_height),
                flags=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_CONSTANT,
            )
        )
        source_mask = np.full(image.shape[:2], 255, dtype=np.uint8)
        masks.append(
            cv2.warpPerspective(
                source_mask,
                transform,
                (canvas_width, canvas_height),
                flags=cv2.INTER_NEAREST,
                borderMode=cv2.BORDER_CONSTANT,
            )
        )
    return WarpResult(
        images=tuple(warped_images),
        masks=tuple(masks),
        canvas_size=plan.canvas_size,
        transforms=plan.transforms,
        output_scale=plan.output_scale,
        estimated_working_set_mib=plan.estimated_working_set_mib,
    )


def _luminance(image: np.ndarray) -> np.ndarray:
    return (
        image[..., 0].astype(np.float32) * 0.2126
        + image[..., 1].astype(np.float32) * 0.7152
        + image[..., 2].astype(np.float32) * 0.0722
    )


def _exposure_gains(
    images: Sequence[np.ndarray],
    masks: Sequence[np.ndarray],
    options: StitchOptions,
) -> tuple[float, ...]:
    gains = [1.0]
    for index in range(1, len(images)):
        overlap = (masks[index - 1] > 0) & (masks[index] > 0)
        if not np.any(overlap):
            gains.append(1.0)
            continue
        reference = np.median(_luminance(images[index - 1])[overlap]) * gains[index - 1]
        current = np.median(_luminance(images[index])[overlap])
        gain = 1.0 if current <= 1e-6 else float(reference / current)
        gains.append(
            float(
                np.clip(
                    gain,
                    options.exposure_gain_min,
                    options.exposure_gain_max,
                )
            )
        )
    return tuple(gains)


def blend_panorama(
    warped_images: Sequence[np.ndarray] | WarpResult,
    masks: Sequence[np.ndarray] | None = None,
    *,
    options: StitchOptions | None = None,
) -> BlendResult:
    """Apply overlap exposure correction and mask-distance feathering."""

    selected = options or StitchOptions()
    if isinstance(warped_images, WarpResult):
        images = warped_images.images
        selected_masks = warped_images.masks
    else:
        images = tuple(warped_images)
        if masks is None:
            raise ValueError("masks are required when warped_images is not WarpResult")
        selected_masks = tuple(masks)
    if not images or len(images) != len(selected_masks):
        raise ValueError("images and masks must have the same non-zero length")
    shape = images[0].shape[:2]
    if any(image.shape[:2] != shape for image in images):
        raise ValueError("all warped images must share a canvas")
    gains = _exposure_gains(images, selected_masks, selected)
    accumulator = np.zeros((*shape, 3), dtype=np.float32)
    weight_sum = np.zeros(shape, dtype=np.float32)
    coverage = np.zeros(shape, dtype=np.uint16)
    blend_width = max(1, selected.blend_width_px)
    for image, mask, gain in zip(images, selected_masks, gains):
        binary = (mask > 0).astype(np.uint8)
        coverage += binary
        distance = cv2.distanceTransform(binary, cv2.DIST_L2, 3)
        weight = np.minimum(distance / blend_width, 1.0)
        weight[binary == 0] = 0
        accumulator += image.astype(np.float32) * gain * weight[..., None]
        weight_sum += weight
    valid = weight_sum > 0
    blended = np.zeros((*shape, 3), dtype=np.uint8)
    blended[valid] = np.clip(
        accumulator[valid] / weight_sum[valid, None],
        0,
        255,
    ).astype(np.uint8)
    return BlendResult(
        image=blended,
        valid_mask=valid,
        seam_mask=coverage > 1,
        exposure_gains=gains,
    )


def _largest_rectangle(mask: np.ndarray) -> CropRect:
    height, width = mask.shape
    heights = np.zeros(width, dtype=np.int32)
    best = CropRect(0, 0, 0, 0)
    best_area = 0
    for row in range(height):
        heights = np.where(mask[row], heights + 1, 0)
        stack: list[tuple[int, int]] = []
        for column in range(width + 1):
            current = int(heights[column]) if column < width else 0
            start = column
            while stack and stack[-1][1] > current:
                position, bar_height = stack.pop()
                area = bar_height * (column - position)
                if area > best_area:
                    best_area = area
                    best = CropRect(
                        position,
                        row - bar_height + 1,
                        column - position,
                        bar_height,
                    )
                start = position
            if not stack or stack[-1][1] < current:
                stack.append((start, current))
    return best


def auto_crop(mask: np.ndarray, *, inset: int = 2) -> CropRect:
    """Find the largest all-valid axis-aligned rectangle and inset it."""

    if mask.ndim != 2:
        raise ValueError("mask must be two-dimensional")
    if inset < 0:
        raise ValueError("inset cannot be negative")
    safe = _largest_rectangle(mask > 0)
    if safe.width <= 2 * inset or safe.height <= 2 * inset:
        raise StitchError(
            "HOMOGRAPHY_UNSTABLE",
            "The panorama has no safe crop rectangle after the 2px inset.",
        )
    return CropRect(
        safe.x + inset,
        safe.y + inset,
        safe.width - 2 * inset,
        safe.height - 2 * inset,
    )
