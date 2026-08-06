from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image


def io_api() -> object:
    from camera_pose import io

    return io


def test_load_analysis_image_applies_exif_before_reporting_pixel_frame(
    tmp_path: Path,
) -> None:
    source = tmp_path / "oriented.jpg"
    image = Image.new("RGB", (40, 20), "black")
    for x in range(20):
        image.putpixel((x, 0), (255, 0, 0))
    exif = Image.Exif()
    exif[274] = 6
    image.save(source, quality=100, exif=exif)

    loaded = io_api().load_analysis_image(source)

    assert loaded.corrected_size_px == (20, 40)
    assert loaded.analysis_size_px == (20, 40)
    rotated_pixel = np.asarray(loaded.image)[0, -1]
    assert int(rotated_pixel[0]) > 150
    assert int(rotated_pixel[0]) > int(rotated_pixel[1]) + 100


def test_load_analysis_image_resizes_long_side_and_preserves_scale_mapping(
    tmp_path: Path,
) -> None:
    source = tmp_path / "large.png"
    Image.new("RGB", (2000, 1000), "white").save(source)

    loaded = io_api().load_analysis_image(source)

    assert loaded.analysis_size_px == (1280, 640)
    np.testing.assert_allclose(loaded.analysis_to_corrected([[640, 320]]), [[1000, 500]])
    np.testing.assert_allclose(loaded.corrected_to_analysis([[1000, 500]]), [[640, 320]])


def test_uncalibrated_intrinsics_fall_back_to_sixty_degree_horizontal_fov() -> None:
    intrinsics = io_api().estimate_uncalibrated_intrinsics((1200, 800), {})
    expected_focal = 1200 / (2 * math.tan(math.radians(60) / 2))
    np.testing.assert_allclose(
        intrinsics.camera_matrix,
        [[expected_focal, 0, 600], [0, expected_focal, 400], [0, 0, 1]],
    )
    np.testing.assert_array_equal(intrinsics.distortion, np.zeros(5))
    assert intrinsics.source == "estimated"
    assert intrinsics.estimation_method == "horizontal-fov-60"


def test_uncalibrated_intrinsics_use_joint_physical_and_35mm_focal_metadata() -> None:
    intrinsics = io_api().estimate_uncalibrated_intrinsics(
        (1200, 800),
        {"FocalLength": 5.0, "FocalLengthIn35mmFilm": 30.0},
    )
    assert intrinsics.camera_matrix[0, 0] == intrinsics.camera_matrix[1, 1] == 1000.0
    assert intrinsics.source == "estimated"
    assert intrinsics.estimation_method == "exif-35mm-equivalent"


def test_uncalibrated_intrinsics_use_consistent_sensor_width_metadata() -> None:
    intrinsics = io_api().estimate_uncalibrated_intrinsics(
        (1200, 800),
        {"FocalLength": 5.0, "SensorWidthMm": 6.0, "FocalLengthIn35mmFilm": 30.0},
    )
    assert intrinsics.camera_matrix[0, 0] == 1000.0
    assert intrinsics.estimation_method == "exif-sensor-width"


def test_uncalibrated_intrinsics_ignore_incomplete_or_inconsistent_exif() -> None:
    api = io_api()
    incomplete = api.estimate_uncalibrated_intrinsics(
        (1200, 800), {"FocalLengthIn35mmFilm": 30.0}
    )
    inconsistent = api.estimate_uncalibrated_intrinsics(
        (1200, 800),
        {"FocalLength": 5.0, "SensorWidthMm": 6.0, "FocalLengthIn35mmFilm": 50.0},
    )
    assert incomplete.estimation_method == "horizontal-fov-60"
    assert inconsistent.estimation_method == "horizontal-fov-60"
