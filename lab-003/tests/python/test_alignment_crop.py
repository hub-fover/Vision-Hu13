from __future__ import annotations

import cv2
import numpy as np
import pytest

from exposure_fusion import FusionError, align_exposures, crop_common_region


def test_alignment_recovers_small_handheld_shift(exposure_stack) -> None:
    dark, normal, bright = exposure_stack
    matrix = np.asarray([[1.0, 0.0, 4.0], [0.0, 1.0, -3.0]], dtype=np.float32)
    shifted_dark = cv2.warpAffine(dark, matrix, (dark.shape[1], dark.shape[0]))
    shifted_bright = cv2.warpAffine(bright, matrix, (bright.shape[1], bright.shape[0]))

    result = align_exposures((shifted_dark, normal, shifted_bright))

    assert len(result.metrics) == 2
    assert all(metric.inlier_count >= 30 for metric in result.metrics)
    assert all(metric.median_reprojection_error_px <= 2 for metric in result.metrics)
    assert np.mean(np.abs(result.images[0].astype(int) - dark.astype(int))) < 8


def test_alignment_rejects_different_aspect_ratios(exposure_stack) -> None:
    dark, normal, bright = exposure_stack

    with pytest.raises(FusionError) as caught:
        align_exposures((dark[:, :-40], normal, bright))

    assert caught.value.code == "SCENE_MISMATCH"


def test_common_crop_has_no_holes() -> None:
    masks = [np.ones((100, 160), dtype=np.uint8) * 255 for _ in range(3)]
    masks[0][:, :5] = 0
    masks[2][:, -6:] = 0

    crop = crop_common_region(masks)
    common = np.logical_and.reduce([mask > 0 for mask in masks])

    assert np.all(crop.apply(common))
    assert crop.width >= 140


def test_crop_rejects_large_invalid_border() -> None:
    masks = [np.ones((100, 100), dtype=np.uint8) * 255 for _ in range(3)]
    masks[0][:, :40] = 0

    with pytest.raises(FusionError) as caught:
        crop_common_region(masks)

    assert caught.value.code == "EXCESSIVE_CROP"
