"""End-to-end adjacent-pair panorama teaching pipeline."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from os import PathLike
from pathlib import Path

import numpy as np

from .contracts import MatchMetrics, StitchOptions
from .diagnostics import write_debug_diagnostics
from .errors import StitchError
from .features import FeatureSet, MatchResult, extract_features, match_pair
from .geometry import (
    HomographyResult,
    compose_transforms,
    estimate_homography,
)
from .io import load_image
from .render import CropRect, auto_crop, blend_panorama, warp_images


ImageSource = np.ndarray | str | PathLike[str]


@dataclass(frozen=True)
class StitchResult:
    """Final cropped panorama and evidence retained for teaching."""

    image: np.ndarray
    crop: CropRect
    match_metrics: tuple[MatchMetrics, ...]
    transforms: tuple[np.ndarray, ...]
    exposure_gains: tuple[float, ...]
    warnings: tuple[str, ...]
    estimated_working_set_mib: float


def input_warnings(
    images: Sequence[np.ndarray] | None = None,
    *,
    image_shapes: Sequence[tuple[int, int]] | None = None,
    options: StitchOptions | None = None,
) -> tuple[str, ...]:
    """Return non-blocking warnings from the shared teaching thresholds."""

    selected = options or StitchOptions()
    if image_shapes is None:
        if images is None:
            raise ValueError("images or image_shapes is required")
        shapes = [image.shape[:2] for image in images]
    else:
        shapes = image_shapes
    warnings: list[str] = []
    if len(shapes) > selected.warning_image_count:
        warnings.append(
            (
                f"{len(shapes)} images exceeds the "
                f"{selected.warning_image_count}-image teaching recommendation."
            )
        )
    source_megapixels = sum(height * width for height, width in shapes) / 1_000_000
    if source_megapixels > selected.warning_source_megapixels:
        warnings.append(
            (
                f"{source_megapixels:.1f} source megapixels exceeds the "
                f"{selected.warning_source_megapixels}MP teaching recommendation."
            )
        )
    return tuple(warnings)


def _decode_sources(
    sources: Sequence[ImageSource],
) -> tuple[list[np.ndarray], list[str]]:
    images: list[np.ndarray] = []
    names: list[str] = []
    for index, source in enumerate(sources):
        if isinstance(source, np.ndarray):
            if (
                source.ndim != 3
                or source.shape[2] != 3
                or source.dtype != np.uint8
                or not source.size
            ):
                raise StitchError(
                    "DECODE_FAILED",
                    f"image {index + 1} must be a non-empty RGB uint8 array.",
                )
            images.append(np.ascontiguousarray(source))
            names.append(f"image-{index + 1:02d}")
        else:
            path = Path(source)
            images.append(load_image(path))
            names.append(path.name)
    return images, names


def _check_cancel(cancel_check: Callable[[], bool] | None) -> None:
    if cancel_check is not None and cancel_check():
        raise StitchError("CANCELLED", "Panorama stitching was cancelled.")


def stitch_images(
    sources: Sequence[ImageSource],
    *,
    options: StitchOptions | None = None,
    quality: str = "mobile",
    debug_dir: str | PathLike[str] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> StitchResult:
    """Stitch an ordered sequence using only adjacent image pairs."""

    selected = options or StitchOptions()
    if len(sources) < 2:
        raise StitchError(
            "NOT_ENOUGH_IMAGES",
            "Choose at least two ordered images with visible overlap.",
        )
    _check_cancel(cancel_check)
    images, names = _decode_sources(sources)
    warnings = input_warnings(images, options=selected)
    _check_cancel(cancel_check)
    features: list[FeatureSet] = []
    for index, image in enumerate(images):
        try:
            features.append(extract_features(image, options=selected))
        except StitchError as error:
            if error.code != "LOW_TEXTURE":
                raise
            pair_index = min(max(0, index - 1), len(names) - 2)
            raise StitchError(
                error.code,
                error.message,
                pair_index=pair_index,
                pair_names=(names[pair_index], names[pair_index + 1]),
            ) from error
    _check_cancel(cancel_check)
    matches: list[MatchResult] = []
    homographies: list[HomographyResult] = []
    for index in range(len(images) - 1):
        pair_names = (names[index], names[index + 1])
        pair_matches = match_pair(
            features[index],
            features[index + 1],
            options=selected,
            pair_index=index,
            pair_names=pair_names,
        )
        matches.append(pair_matches)
        homographies.append(
            estimate_homography(
                features[index],
                features[index + 1],
                pair_matches,
                options=selected,
            )
        )
        _check_cancel(cancel_check)
    composed = compose_transforms(
        [result.transform for result in homographies],
        image_count=len(images),
    )
    warped = warp_images(
        images,
        composed,
        options=selected,
        quality=quality,
    )
    _check_cancel(cancel_check)
    blended = blend_panorama(warped, options=selected)
    crop = auto_crop(blended.valid_mask, inset=2)
    if debug_dir is not None:
        write_debug_diagnostics(
            debug_dir,
            features=features,
            matches=matches,
            homographies=homographies,
            composed_transforms=composed,
            warped=warped,
            blended=blended,
        )
    return StitchResult(
        image=np.ascontiguousarray(crop.apply(blended.image)),
        crop=crop,
        match_metrics=tuple(result.metrics for result in homographies),
        transforms=tuple(composed),
        exposure_gains=blended.exposure_gains,
        warnings=warnings,
        estimated_working_set_mib=warped.estimated_working_set_mib,
    )
