from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from camera_pose import CameraPoseError, PlaneTarget
from camera_pose.geometry import (
    apply_homography,
    compute_normalized_homography,
    plane_object_points,
    validate_quad,
)


FIXTURE_PATH = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "geometry.json"


def assert_code(code: str, callback: object) -> None:
    with pytest.raises(CameraPoseError) as caught:
        callback()  # type: ignore[operator]
    assert caught.value.code == code


@pytest.mark.parametrize("size", [(0, 480), (-1, 480), (640, float("nan"))])
def test_validate_quad_rejects_invalid_dimensions(size: tuple[float, float]) -> None:
    quad = [[100, 100], [500, 100], [500, 380], [100, 380]]
    assert_code("INVALID_DIMENSIONS", lambda: validate_quad(quad, *size))


@pytest.mark.parametrize(
    "quad",
    [
        [[100, 100], [100, 100], [500, 380], [100, 380]],
        [[100, 100], [500, 380], [500, 100], [100, 380]],
        [[100, 100], [300, 100], [500, 100], [100, 380]],
        [[500, 100], [500, 380], [100, 380], [100, 100]],
    ],
)
def test_validate_quad_rejects_duplicates_crossing_collinearity_and_wrong_order(
    quad: list[list[float]],
) -> None:
    assert_code("INVALID_QUAD", lambda: validate_quad(quad, 640, 480))


@pytest.mark.parametrize(
    "quad",
    [
        [[0, 100], [500, 100], [500, 380], [100, 380]],
        [[100, 100], [640, 100], [500, 380], [100, 380]],
    ],
)
def test_validate_quad_rejects_targets_clipped_by_image_boundary(
    quad: list[list[float]],
) -> None:
    assert_code("TARGET_CLIPPED", lambda: validate_quad(quad, 640, 480))


def test_validate_quad_rejects_target_below_minimum_area() -> None:
    quad = [[300, 230], [310, 230], [310, 240], [300, 240]]
    assert_code("TARGET_TOO_SMALL", lambda: validate_quad(quad, 640, 480))


def test_plane_object_points_use_center_origin_and_user_axes() -> None:
    points = plane_object_points(PlaneTarget(width_m=0.4, height_m=0.2))
    np.testing.assert_allclose(
        points,
        [
            [-0.2, +0.1, 0.0],
            [+0.2, +0.1, 0.0],
            [+0.2, -0.1, 0.0],
            [-0.2, -0.1, 0.0],
        ],
    )


def test_shared_geometry_fixture_has_stable_normalized_homography_mapping() -> None:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert fixture["cornerOrder"] == ["TL", "TR", "BR", "BL"]
    source = np.asarray(fixture["source"], dtype=float)
    destination = np.asarray(fixture["destination"], dtype=float)
    matrix = compute_normalized_homography(source, destination)
    np.testing.assert_allclose(matrix / matrix[2, 2], fixture["homography"], atol=1e-10)
    np.testing.assert_allclose(apply_homography(matrix, source), destination, atol=1e-8)


def test_normalized_homography_rejects_rank_deficient_correspondences() -> None:
    source = [[0, 0], [1, 0], [2, 0], [0, 1]]
    destination = [[0, 0], [2, 0], [4, 0], [0, 2]]
    assert_code(
        "INVALID_QUAD",
        lambda: compute_normalized_homography(source, destination),
    )
