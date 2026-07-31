"""End-to-end three-exposure teaching pipeline."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from os import PathLike
from pathlib import Path

import cv2
import numpy as np

from .alignment import AlignmentResult, align_exposures
from .analysis import analyze_exposures
from .contracts import CropRect, FusionOptions, FusionReport, MotionMetrics
from .crop import crop_common_region
from .diagnostics import write_diagnostics
from .errors import FusionError
from .io import load_image, resize_to_pixel_cap
from .motion import detect_motion, protect_motion
from .pyramid import fuse_pyramids
from .weights import compute_quality_weights


ImageSource = np.ndarray | str | PathLike[str]


@dataclass(frozen=True)
class FusionResult:
    image: np.ndarray
    crop: CropRect
    motion_mask: np.ndarray
    weights: np.ndarray
    report: FusionReport
    transforms: tuple[np.ndarray, np.ndarray, np.ndarray]


def estimate_working_set_mib(width: int, height: int) -> float:
    # Three RGBA sources, float pyramids, normalized weights, accumulators, and output.
    return width * height * 72 / (1024 * 1024)


def _decode(sources: Sequence[ImageSource]) -> list[np.ndarray]:
    images = []
    for index, source in enumerate(sources):
        if isinstance(source, np.ndarray):
            if source.dtype != np.uint8 or source.ndim != 3 or source.shape[2] != 3 or not source.size:
                raise FusionError("DECODE_FAILED", f"Image {index + 1} must be RGB uint8 pixels.")
            images.append(np.ascontiguousarray(source))
        else:
            images.append(load_image(source))
    return images


def _check_cancel(cancel_check: Callable[[], bool] | None) -> None:
    if cancel_check is not None and cancel_check():
        raise FusionError("CANCELLED", "Exposure fusion was cancelled.")


def _resize_stack(images: Sequence[np.ndarray], options: FusionOptions) -> list[np.ndarray]:
    source_pixels = sum(image.shape[0] * image.shape[1] for image in images)
    if source_pixels > options.max_input_megapixels * 1_000_000:
        raise FusionError("OUTPUT_TOO_LARGE", "The three source images exceed the 48MP input budget.")
    reference_pixels = images[1].shape[0] * images[1].shape[1]
    scale = min(1.0, (options.max_output_pixels / reference_pixels) ** 0.5)
    resized = []
    for image in images:
        if scale < 1:
            size = (max(1, round(image.shape[1] * scale)), max(1, round(image.shape[0] * scale)))
            image = cv2.resize(image, size, interpolation=cv2.INTER_AREA)
        resized.append(np.ascontiguousarray(image))
    estimate = estimate_working_set_mib(resized[1].shape[1], resized[1].shape[0])
    if estimate > options.max_working_set_mib:
        raise FusionError("OUTPUT_TOO_LARGE", "The estimated working set exceeds 320MiB.")
    return resized


def fuse_exposures(
    sources: Sequence[ImageSource],
    *,
    options: FusionOptions | None = None,
    debug_dir: str | PathLike[str] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> FusionResult:
    selected = options or FusionOptions()
    if len(sources) != selected.input_count:
        raise FusionError("INVALID_IMAGE_COUNT", "Choose exactly three exposures.")
    _check_cancel(cancel_check)
    decoded = _decode(sources)
    exposure = analyze_exposures(decoded)
    ordered = [decoded[index] for index in exposure.ordered_indices]
    ordered = _resize_stack(ordered, selected)
    _check_cancel(cancel_check)
    aligned: AlignmentResult = align_exposures(ordered, selected)
    crop = crop_common_region(aligned.masks)
    cropped_images = tuple(np.ascontiguousarray(crop.apply(image)) for image in aligned.images)
    _check_cancel(cancel_check)
    weights, components = compute_quality_weights(cropped_images, selected)
    motion_mask = detect_motion(cropped_images)
    if selected.motion_protection:
        weights, motion = protect_motion(weights, motion_mask)
    else:
        fraction = float(np.mean(motion_mask > 0))
        motion = MotionMetrics(detected_fraction=fraction, protected_fraction=0.0)
    fused_float = fuse_pyramids(cropped_images, weights, selected.pyramid_levels)
    output = np.clip(np.round(fused_float * 255), 0, 255).astype(np.uint8)
    estimate = estimate_working_set_mib(output.shape[1], output.shape[0])
    report = FusionReport(
        exposure=exposure,
        alignments=aligned.metrics,
        motion=motion,
        crop=crop,
        output_width=output.shape[1],
        output_height=output.shape[0],
        estimated_working_set_mib=estimate,
    )
    result = FusionResult(
        image=np.ascontiguousarray(output),
        crop=crop,
        motion_mask=motion_mask,
        weights=weights,
        report=report,
        transforms=aligned.transforms,
    )
    if debug_dir is not None:
        write_diagnostics(
            debug_dir,
            result=result,
            ordered_images=cropped_images,
            components=components,
            weights=weights,
        )
    return result


process_stack = fuse_exposures
