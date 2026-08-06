from __future__ import annotations

import cv2
import numpy as np

from camera_pose import CameraIntrinsics, MeasurementInterval, PlaneTarget
from camera_pose.geometry import plane_object_points


def uncertainty_api() -> object:
    from camera_pose import uncertainty

    return uncertainty


def synthetic_case() -> tuple[np.ndarray, np.ndarray, CameraIntrinsics]:
    object_points = plane_object_points(PlaneTarget(0.4, 0.2))
    intrinsics = CameraIntrinsics(
        camera_matrix=np.asarray([[800.0, 0, 640], [0, 800.0, 360], [0, 0, 1]]),
        distortion=np.zeros(5),
        image_size_px=(1280, 720),
        source="estimated",
    )
    image_points = cv2.projectPoints(
        object_points,
        np.asarray([3.0, 0.2, 0.1]),
        np.asarray([0.03, -0.02, 1.2]),
        intrinsics.camera_matrix,
        intrinsics.distortion,
    )[0].reshape(-1, 2)
    return object_points, image_points, intrinsics


def test_uncertainty_uses_exactly_64_deterministic_perturbations() -> None:
    object_points, image_points, intrinsics = synthetic_case()
    api = uncertainty_api()

    first = api.estimate_distance_interval(
        object_points, image_points, intrinsics, corner_sigma_px=0.4
    )
    second = api.estimate_distance_interval(
        object_points, image_points, intrinsics, corner_sigma_px=0.4
    )

    assert api.UNCERTAINTY_SAMPLES == 64
    assert first == second
    assert first is not None
    assert first.confidence == 0.90
    assert first.lower_m <= first.median_m <= first.upper_m


def test_intrinsic_uncertainty_widens_distance_interval() -> None:
    object_points, image_points, intrinsics = synthetic_case()
    api = uncertainty_api()
    corners_only = api.estimate_distance_interval(
        object_points, image_points, intrinsics, corner_sigma_px=0.2
    )
    with_intrinsics = api.estimate_distance_interval(
        object_points,
        image_points,
        intrinsics,
        corner_sigma_px=0.2,
        focal_sigma_fraction=0.05,
    )
    assert corners_only is not None and with_intrinsics is not None
    assert with_intrinsics.upper_m - with_intrinsics.lower_m > (
        corners_only.upper_m - corners_only.lower_m
    )


def test_invalid_pose_has_no_uncertainty_interval() -> None:
    _, _, intrinsics = synthetic_case()
    interval = uncertainty_api().estimate_distance_interval(
        np.zeros((4, 3)), np.zeros((4, 2)), intrinsics
    )
    assert interval is None


def test_interval_widening_can_only_downgrade_quality() -> None:
    api = uncertainty_api()
    narrow = MeasurementInterval(median_m=1.0, lower_m=0.98, upper_m=1.02)
    medium = MeasurementInterval(median_m=1.0, lower_m=0.90, upper_m=1.10)
    wide = MeasurementInterval(median_m=1.0, lower_m=0.75, upper_m=1.25)
    assert api.quality_with_uncertainty("stable", narrow) == "stable"
    assert api.quality_with_uncertainty("stable", medium) == "reference-only"
    assert api.quality_with_uncertainty("stable", wide) == "unstable"
    assert api.quality_with_uncertainty("unstable", narrow) == "unstable"
