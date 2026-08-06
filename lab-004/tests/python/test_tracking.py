from __future__ import annotations

import cv2
import numpy as np
import pytest

from camera_pose import CameraIntrinsics, CameraPoseError, PlaneTarget
from camera_pose.geometry import plane_object_points


def tracking_api() -> object:
    from camera_pose import tracking

    return tracking


def textured_frame(shift: tuple[int, int] = (0, 0)) -> tuple[np.ndarray, np.ndarray]:
    frame = np.zeros((360, 640), np.uint8)
    quad = cv2.projectPoints(
        plane_object_points(PlaneTarget(.9, 2.0)),
        np.asarray([2.7, .3, .1]),
        np.asarray([0., 0., 4.0]),
        intrinsics().camera_matrix,
        intrinsics().distortion,
    )[0].reshape(4, 2)
    for y in range(90, 300, 18):
        for x in range(180, 470, 18):
            cv2.circle(frame, (x, y), 3, 255 if (x + y) % 36 else 150, -1)
    dx, dy = shift
    transform = np.asarray([[1, 0, dx], [0, 1, dy]], np.float32)
    moved = cv2.warpAffine(frame, transform, (640, 360))
    return moved, quad + [dx, dy]


def intrinsics() -> CameraIntrinsics:
    return CameraIntrinsics(
        np.asarray([[520., 0, 320], [0, 520., 180], [0, 0, 1]]),
        np.zeros(5), (640, 360), "estimated"
    )


def test_tracker_initializes_at_most_300_features_and_tracks_motion() -> None:
    api = tracking_api()
    frame, quad = textured_frame()
    tracker = api.PlanarTracker(PlaneTarget(.9, 2.0), intrinsics())
    initial = tracker.initialize(frame, quad)

    assert initial.status == "tracking"
    assert initial.pose is not None
    assert initial.measurements is not None
    assert 12 <= initial.metrics.tracked_features <= 300

    moved, expected_quad = textured_frame((7, 4))
    state = tracker.update(moved)
    assert state.status == "tracking"
    np.testing.assert_allclose(state.quad_px, expected_quad, atol=1.5)
    assert state.metrics.homography_inlier_ratio >= .60
    assert state.metrics.median_forward_backward_error_px <= 1.5


def test_tracker_enters_lost_on_third_bad_frame_and_clears_pose() -> None:
    api = tracking_api()
    frame, quad = textured_frame()
    tracker = api.PlanarTracker(PlaneTarget(.9, 2.0), intrinsics())
    tracker.initialize(frame, quad)
    blank = np.zeros_like(frame)

    first_bad = tracker.update(blank)
    second_bad = tracker.update(blank)
    assert first_bad.metrics.consecutive_bad_frames == 1
    assert first_bad.pose is None
    assert first_bad.measurements is None
    assert second_bad.metrics.consecutive_bad_frames == 2
    assert second_bad.pose is None
    assert second_bad.measurements is None
    lost = tracker.update(blank)

    assert lost.status == "lost"
    assert lost.pose is None
    assert lost.measurements is None
    np.testing.assert_array_equal(lost.quad_px, quad)
    with pytest.raises(CameraPoseError) as caught:
        tracker.update(frame)
    assert caught.value.code == "TRACKING_LOST"


def test_tracker_requires_manual_reinitialize_after_loss() -> None:
    api = tracking_api()
    frame, quad = textured_frame()
    tracker = api.PlanarTracker(PlaneTarget(.9, 2.0), intrinsics())
    tracker.initialize(frame, quad)
    for _ in range(3):
        tracker.update(np.zeros_like(frame))

    state = tracker.initialize(frame, quad)
    assert state.status == "tracking"
    assert state.metrics.consecutive_bad_frames == 0


def test_tracker_can_recover_before_three_consecutive_bad_frames() -> None:
    api = tracking_api()
    frame, quad = textured_frame()
    tracker = api.PlanarTracker(PlaneTarget(.9, 2.0), intrinsics())
    tracker.initialize(frame, quad)
    assert tracker.update(np.zeros_like(frame)).metrics.consecutive_bad_frames == 1

    recovered = tracker.update(textured_frame((4, 2))[0])

    assert recovered.status == "tracking"
    assert recovered.metrics.consecutive_bad_frames == 0
    np.testing.assert_allclose(recovered.quad_px, quad + [4, 2], atol=1.5)


def test_feature_initializer_rejects_low_texture() -> None:
    api = tracking_api()
    with pytest.raises(CameraPoseError) as caught:
        api.initialize_tracking_points(np.zeros((360, 640), np.uint8), textured_frame()[1])
    assert caught.value.code == "LOW_TEXTURE"


def test_tracker_initialize_raises_when_initial_pose_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api = tracking_api()
    frame, quad = textured_frame()
    monkeypatch.setattr(
        api,
        "estimate_pose",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(CameraPoseError("POSE_FAILED")),
    )

    with pytest.raises(CameraPoseError) as caught:
        api.PlanarTracker(PlaneTarget(.9, 2.0), intrinsics()).initialize(frame, quad)

    assert caught.value.code == "POSE_FAILED"


def test_pose_failures_are_bad_frames_and_preserve_only_last_good_quad(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api = tracking_api()
    frame, quad = textured_frame()
    tracker = api.PlanarTracker(PlaneTarget(.9, 2.0), intrinsics())
    initial = tracker.initialize(frame, quad)
    assert initial.pose is not None
    moved = textured_frame((4, 2))[0]
    monkeypatch.setattr(
        api,
        "estimate_pose",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(CameraPoseError("POSE_FAILED")),
    )

    first = tracker.update(moved)
    second = tracker.update(moved)
    lost = tracker.update(moved)

    for index, state in enumerate((first, second, lost), start=1):
        assert state.metrics.consecutive_bad_frames == index
        assert state.pose is None
        assert state.measurements is None
        np.testing.assert_array_equal(state.quad_px, quad)
    assert lost.status == "lost"


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_tracking_rejects_nonfinite_frames(value: float) -> None:
    api = tracking_api()
    frame = np.full((360, 640), value, np.float64)
    with pytest.raises(CameraPoseError) as caught:
        api.initialize_tracking_points(frame, textured_frame()[1])
    assert caught.value.code == "UNSUPPORTED_CAMERA"
