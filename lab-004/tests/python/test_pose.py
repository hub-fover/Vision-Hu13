from __future__ import annotations

import math

import cv2
import numpy as np
import pytest

from camera_pose import CameraIntrinsics, CameraPoseError, PlaneTarget
from camera_pose.geometry import plane_object_points


def pose_api() -> object:
    from camera_pose import pose

    return pose


def intrinsics() -> CameraIntrinsics:
    return CameraIntrinsics(
        camera_matrix=np.asarray([[800.0, 0, 640], [0, 800.0, 360], [0, 0, 1]]),
        distortion=np.zeros(5),
        image_size_px=(1280, 720),
        source="estimated",
    )


def projected_pose(
    rotation_vector: np.ndarray, translation: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    object_points = plane_object_points(PlaneTarget(0.4, 0.2))
    image_points = cv2.projectPoints(
        object_points,
        rotation_vector,
        translation,
        intrinsics().camera_matrix,
        intrinsics().distortion,
    )[0].reshape(-1, 2)
    return object_points, image_points


@pytest.mark.parametrize(
    ("normalized_rms", "expected"),
    [
        (0.0, "stable"),
        (0.0015, "stable"),
        (0.001500001, "reference-only"),
        (0.0035, "reference-only"),
        (0.003500001, "unstable"),
    ],
)
def test_quality_boundaries_are_fixed(normalized_rms: float, expected: str) -> None:
    assert pose_api().quality_from_normalized_rms(normalized_rms) == expected


def test_zyx_euler_decomposition_uses_rz_ry_rx_convention() -> None:
    z, y, x = 0.35, -0.25, 0.15
    cz, sz = math.cos(z), math.sin(z)
    cy, sy = math.cos(y), math.sin(y)
    cx, sx = math.cos(x), math.sin(x)
    rz = np.asarray([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    ry = np.asarray([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rx = np.asarray([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    np.testing.assert_allclose(pose_api().decompose_euler_zyx(rz @ ry @ rx), [z, y, x])


def test_ippe_pose_has_positive_depth_and_camera_center_sign_convention() -> None:
    rotation_vector = np.asarray([3.0, 0.2, 0.1])
    translation = np.asarray([0.03, -0.02, 1.2])
    object_points, image_points = projected_pose(rotation_vector, translation)

    estimate = pose_api().estimate_pose(object_points, image_points, intrinsics())

    expected_rotation = cv2.Rodrigues(rotation_vector)[0]
    expected_center = -expected_rotation.T @ translation
    camera_points = (estimate.rotation_matrix @ object_points.T).T + estimate.translation_m
    assert np.all(camera_points[:, 2] > 0)
    np.testing.assert_allclose(estimate.camera_center_m, expected_center, atol=1e-7)
    assert estimate.perpendicular_distance_m == pytest.approx(expected_center[2], abs=1e-7)
    assert estimate.target_center_distance_m == pytest.approx(np.linalg.norm(expected_center))
    assert estimate.horizontal_offset_m == pytest.approx(expected_center[0], abs=1e-7)
    assert estimate.vertical_offset_m == pytest.approx(expected_center[1], abs=1e-7)
    assert estimate.quality == "stable"


def test_similarly_plausible_planar_candidates_are_ambiguous_for_still_pose() -> None:
    rotation_vector = np.asarray([math.pi - 0.003, 0.02, 0.01])
    translation = np.asarray([0.01, 0.01, 2.0])
    object_points, image_points = projected_pose(rotation_vector, translation)

    with pytest.raises(CameraPoseError) as caught:
        pose_api().estimate_pose(object_points, image_points, intrinsics())

    assert caught.value.code == "POSE_AMBIGUOUS"


def test_live_pose_uses_supplied_prior_to_resolve_planar_ambiguity() -> None:
    rotation_vector = np.asarray([math.pi - 0.003, 0.02, 0.01])
    translation = np.asarray([0.01, 0.01, 2.0])
    object_points, image_points = projected_pose(rotation_vector, translation)

    estimate = pose_api().estimate_pose(
        object_points,
        image_points,
        intrinsics(),
        prior_pose=(rotation_vector, translation),
        live_mode=True,
    )

    np.testing.assert_allclose(estimate.translation_m, translation, atol=1e-6)
    np.testing.assert_allclose(estimate.rotation_matrix, cv2.Rodrigues(rotation_vector)[0], atol=1e-6)


def test_prior_is_not_used_to_hide_ambiguity_outside_live_mode() -> None:
    rotation_vector = np.asarray([math.pi - 0.003, 0.02, 0.01])
    translation = np.asarray([0.01, 0.01, 2.0])
    object_points, image_points = projected_pose(rotation_vector, translation)

    with pytest.raises(CameraPoseError) as caught:
        pose_api().estimate_pose(
            object_points,
            image_points,
            intrinsics(),
            prior_pose=(rotation_vector, translation),
            live_mode=False,
        )
    assert caught.value.code == "POSE_AMBIGUOUS"
