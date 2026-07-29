from __future__ import annotations

import numpy as np
import panorama_stitch as panorama
import pytest


def api(name: str):
    assert hasattr(panorama, name), f"missing public API: {name}"
    return getattr(panorama, name)


def translation(x: float, y: float = 0) -> np.ndarray:
    return np.asarray([[1, 0, x], [0, 1, y], [0, 0, 1]], dtype=np.float64)


def test_compose_transforms_anchors_the_middle_image() -> None:
    compose_transforms = api("compose_transforms")

    transforms = compose_transforms([translation(50), translation(40)])

    assert transforms[0] == pytest.approx(translation(50))
    assert transforms[1] == pytest.approx(np.eye(3))
    assert transforms[2] == pytest.approx(translation(-40))


def test_compose_transforms_composes_multiple_left_hops_in_order() -> None:
    compose_transforms = api("compose_transforms")
    scale = np.diag([2.0, 2.0, 1.0])

    transforms = compose_transforms(
        [translation(10), scale, translation(30)],
        anchor_index=2,
    )

    assert transforms[0] == pytest.approx(scale @ translation(10))
    assert transforms[1] == pytest.approx(scale)
    assert transforms[2] == pytest.approx(np.eye(3))
    assert transforms[3] == pytest.approx(translation(-30))


def test_warp_images_estimates_canvas_and_preserves_valid_masks() -> None:
    warp_images = api("warp_images")
    left = np.full((10, 10, 3), (255, 0, 0), dtype=np.uint8)
    right = np.full((10, 10, 3), (0, 0, 255), dtype=np.uint8)

    result = warp_images([left, right], [np.eye(3), translation(8)])

    assert result.canvas_size == (18, 10)
    assert len(result.images) == len(result.masks) == 2
    assert np.count_nonzero(result.masks[0]) == 100
    assert np.count_nonzero(result.masks[1]) == 100
    assert np.all(result.images[0][2, 2] == (255, 0, 0))
    assert np.all(result.images[1][2, 10] == (0, 0, 255))


def test_warp_images_downscales_to_the_requested_megapixel_cap() -> None:
    warp_images = api("warp_images")
    image = np.zeros((1000, 2000, 3), dtype=np.uint8)
    options = panorama.StitchOptions(mobile_output_megapixels=1)

    result = warp_images([image], [np.eye(3)], options=options, quality="mobile")

    assert result.output_scale == pytest.approx(2**-0.5, rel=0.01)
    assert result.canvas_size[0] * result.canvas_size[1] <= 1_002_000


def test_warp_images_rejects_an_over_budget_working_set_before_allocating() -> None:
    warp_images = api("warp_images")
    image = np.zeros((512, 512, 3), dtype=np.uint8)
    options = panorama.StitchOptions(max_working_set_mib=1)

    with pytest.raises(Exception) as caught:
        warp_images([image, image], [np.eye(3), translation(200)], options=options)

    assert caught.value.code == "OUTPUT_TOO_LARGE"
    assert "working set" in str(caught.value).lower()


def test_canvas_plan_downsamples_three_12mp_sources_to_fit_the_memory_budget() -> None:
    plan_canvas = api("plan_canvas")
    shapes = [(3000, 4000)] * 3

    plan = plan_canvas(shapes, [np.eye(3)] * 3)

    assert plan.output_scale < 1.0
    assert plan.canvas_size[0] * plan.canvas_size[1] < 12_000_000
    assert plan.estimated_working_set_mib <= 384


def test_canvas_memory_model_covers_the_peak_blend_allocations() -> None:
    plan_canvas = api("plan_canvas")
    shapes = [(800, 1200)] * 3

    plan = plan_canvas(shapes, [np.eye(3)] * 3)

    canvas_pixels = plan.canvas_size[0] * plan.canvas_size[1]
    source_and_analysis_bytes = sum(height * width * 6 for height, width in shapes)
    minimum_blend_bytes_per_pixel = 64 + 4 * len(shapes)
    modeled_lower_bound = (
        source_and_analysis_bytes
        + canvas_pixels * minimum_blend_bytes_per_pixel
    )
    assert plan.canvas_bytes_per_pixel >= minimum_blend_bytes_per_pixel
    assert plan.estimated_working_set_bytes >= modeled_lower_bound
    assert plan.estimated_working_set_bytes <= 384 * 1024 * 1024


def test_blend_panorama_clamps_overlap_exposure_gain() -> None:
    blend_panorama = api("blend_panorama")
    masks = [np.ones((20, 20), dtype=np.uint8) * 255 for _ in range(2)]
    bright = np.full((20, 20, 3), 200, dtype=np.uint8)
    dark = np.full((20, 20, 3), 50, dtype=np.uint8)

    result = blend_panorama([bright, dark], masks)

    assert result.exposure_gains == pytest.approx((1.0, 1.3))
    assert 130 <= int(result.image[10, 10, 0]) <= 135
    assert np.all(result.valid_mask)


def test_blend_panorama_feathers_the_overlap_without_a_blank_seam() -> None:
    blend_panorama = api("blend_panorama")
    left = np.full((12, 12, 3), 50, dtype=np.uint8)
    right = np.full((12, 12, 3), 200, dtype=np.uint8)
    left_mask = np.zeros((12, 12), dtype=np.uint8)
    right_mask = np.zeros((12, 12), dtype=np.uint8)
    left_mask[:, :8] = 255
    right_mask[:, 4:] = 255

    result = blend_panorama([left, right], [left_mask, right_mask])

    row = result.image[6, :, 0]
    assert np.all(result.valid_mask)
    assert row[4] < row[5] < row[6] < row[7]
    assert row[3] == 50
    assert row[8] == 140


def test_auto_crop_finds_the_largest_safe_rectangle_and_insets_two_pixels() -> None:
    auto_crop = api("auto_crop")
    mask = np.zeros((12, 16), dtype=np.uint8)
    mask[1:10, 2:14] = 255

    crop = auto_crop(mask)

    assert (crop.x, crop.y, crop.width, crop.height) == (4, 3, 8, 5)
    assert np.all(mask[crop.y : crop.bottom, crop.x : crop.right])


def test_auto_crop_never_includes_a_blank_hole() -> None:
    auto_crop = api("auto_crop")
    mask = np.ones((20, 30), dtype=np.uint8) * 255
    mask[3:17, 14:16] = 0

    crop = auto_crop(mask)

    assert crop.width > 0 and crop.height > 0
    assert np.all(mask[crop.y : crop.bottom, crop.x : crop.right])
