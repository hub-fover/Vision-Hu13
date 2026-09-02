from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from exposure_fusion import FusionError, analyze_exposures
from exposure_fusion.io import load_image, resize_to_pixel_cap


def test_exposures_are_sorted_dark_to_bright(exposure_stack) -> None:
    dark, normal, bright = exposure_stack

    metrics = analyze_exposures([bright, dark, normal])

    assert metrics.ordered_indices == (1, 2, 0)
    assert metrics.relative_spread >= 0.75
    assert metrics.highlight_clipping[0] > metrics.highlight_clipping[2]


def test_similar_exposures_are_rejected(exposure_stack) -> None:
    normal = exposure_stack[1]

    with pytest.raises(FusionError) as caught:
        analyze_exposures([normal, normal, normal])

    assert caught.value.code == "EXPOSURE_SPREAD_TOO_SMALL"


def test_exactly_three_inputs_are_required(exposure_stack) -> None:
    with pytest.raises(FusionError) as caught:
        analyze_exposures(exposure_stack[:2])

    assert caught.value.code == "INVALID_IMAGE_COUNT"


def test_loader_rejects_unknown_format(tmp_path: Path) -> None:
    source = tmp_path / "frame.bmp"
    Image.new("RGB", (10, 10), "red").save(source)

    with pytest.raises(FusionError) as caught:
        load_image(source)

    assert caught.value.code == "UNSUPPORTED_FORMAT"


def test_pixel_cap_never_enlarges() -> None:
    image = np.zeros((100, 200, 3), dtype=np.uint8)
    same, scale = resize_to_pixel_cap(image, 100_000)
    smaller, smaller_scale = resize_to_pixel_cap(image, 5_000)

    assert same is image and scale == 1
    assert smaller.shape[:2] == (50, 100)
    assert smaller_scale == 0.5
