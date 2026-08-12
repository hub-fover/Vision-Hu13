from __future__ import annotations

import json
import math
from dataclasses import replace
from pathlib import Path

import cv2
import numpy as np
import pytest

from camera_pose import (
    CALIBRATION_SCHEMA,
    CalibrationMetrics,
    CalibrationResult,
    CameraIntrinsics,
    CameraPoseError,
    PlaneTarget,
)
from camera_pose.geometry import plane_object_points


def calibration_api() -> object:
    from camera_pose import calibration

    return calibration


def synthetic_captures(*, focal_px: float = 900.0, count: int = 10) -> list[object]:
    api = calibration_api()
    size = (1280, 720)
    matrix = np.asarray([[focal_px, 0, 640], [0, focal_px, 360], [0, 0, 1.0]])
    object_points = plane_object_points(PlaneTarget(0.9, 2.0))
    captures = []
    angles = [(-18, -12), (-12, 10), (-7, -18), (0, 0), (8, 14),
              (14, -9), (20, 5), (-21, 8), (11, 21), (-15, -22), (22, -14), (5, -25)]
    for index, (x_deg, y_deg) in enumerate(angles[:count]):
        rvec = np.radians([math.pi * 180 / math.pi + x_deg, y_deg, index - count / 2])
        tvec = np.asarray([(index % 4 - 1.5) * 0.16, (index // 4 - 1) * 0.10, 4.2])
        points = cv2.projectPoints(object_points, rvec, tvec, matrix, np.zeros(5))[0].reshape(4, 2)
        # Deterministic high-frequency image, independent of calibration geometry.
        yy, xx = np.indices((size[1], size[0]))
        gray = (((xx // 4 + yy // 4 + index) % 2) * 220 + 20).astype(np.uint8)
        captures.append(api.CalibrationCapture(
            image=gray,
            image_points_px=points,
            object_points_m=object_points,
            identity=api.CameraIdentity("camera-a", "wide", 1.0, 1, size),
            corner_uncertainty_px=0.4,
            name=f"view-{index:02d}",
        ))
    return captures


def test_quick_calibration_recovers_shared_focal_with_fixed_model() -> None:
    result = calibration_api().calibrate_quick(synthetic_captures())

    assert result.intrinsics.source == "quick-calibrated"
    assert result.metrics.accepted_views == 10
    assert result.intrinsics.camera_matrix[0, 0] == pytest.approx(900.0, rel=0.05)
    assert result.intrinsics.camera_matrix[1, 1] == pytest.approx(900.0, rel=0.05)
    np.testing.assert_allclose(result.intrinsics.camera_matrix[:2, 2], [640, 360])
    np.testing.assert_array_equal(result.intrinsics.distortion, np.zeros(8))


def test_quick_calibration_runs_a_deterministic_held_out_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0
    original = cv2.calibrateCameraExtended

    def counted(*args: object, **kwargs: object) -> object:
        nonlocal calls
        calls += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(cv2, "calibrateCameraExtended", counted)
    calibration_api().calibrate_quick(synthetic_captures())
    assert calls >= 2


def test_quick_calibration_maps_invalid_solver_output_to_calibration_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captures = synthetic_captures()
    monkeypatch.setattr(
        cv2,
        "calibrateCameraExtended",
        lambda *_args, **_kwargs: (
            float("nan"), np.eye(3), np.zeros(8), [], [], np.zeros(18), np.zeros(8), np.zeros(10)
        ),
    )
    with pytest.raises(CameraPoseError) as caught:
        calibration_api().calibrate_quick(captures)
    assert caught.value.code == "CALIBRATION_FAILED"


def test_quick_calibration_requires_eight_accepted_diverse_views() -> None:
    with pytest.raises(CameraPoseError) as caught:
        calibration_api().calibrate_quick(synthetic_captures(count=7))
    assert caught.value.code == "INSUFFICIENT_VIEW_DIVERSITY"


@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        (lambda points: points.__setitem__((0, 2), 0.01), "INVALID_DIMENSIONS"),
        (lambda points: points.__setitem__(1, points[0]), "INVALID_QUAD"),
        (lambda points: points.__setitem__((1, 1), points[1, 1] + 0.1), "INVALID_QUAD"),
        (lambda points: points.__setitem__([1, 2], points[[2, 1]]), "INVALID_QUAD"),
    ],
)
def test_quick_calibration_rejects_malformed_object_rectangles_before_opencv(
    mutation: object, code: str
) -> None:
    api = calibration_api()
    captures = synthetic_captures()
    changed = captures[-1]
    object_points = np.asarray(changed.object_points_m).copy()
    mutation(object_points)
    captures[-1] = replace(changed, object_points_m=object_points)

    assessment = api.assess_calibration_capture(captures[-1])
    assert not assessment.accepted
    assert assessment.reason_code == code


def test_quick_calibration_rejects_inconsistent_rectangle_dimensions() -> None:
    api = calibration_api()
    captures = synthetic_captures()
    changed = captures[-1]
    object_points = np.asarray(changed.object_points_m).copy()
    object_points[:, 0] *= 0.8
    captures[-1] = replace(changed, object_points_m=object_points)

    result = api.calibrate_quick(captures)

    assert result.metrics.accepted_views == 9


def test_quick_calibration_filters_one_malformed_view_when_eight_valid_remain() -> None:
    api = calibration_api()
    captures = synthetic_captures(count=9)
    malformed = captures[-1]
    object_points = np.asarray(malformed.object_points_m).copy()
    object_points[0, 2] = 0.01
    captures[-1] = replace(malformed, object_points_m=object_points, name="malformed")

    result = api.calibrate_quick(captures)

    assessment = api.assess_calibration_capture(captures[-1])
    assert not assessment.accepted
    assert assessment.reason_code == "INVALID_DIMENSIONS"
    assert result.metrics.accepted_views == 8


def test_object_plane_tolerance_scales_with_a_small_known_target() -> None:
    api = calibration_api()
    capture = synthetic_captures(count=1)[0]
    object_points = plane_object_points(PlaneTarget(.001, .002))
    object_points[0, 2] = 5e-5
    assessment = api.assess_calibration_capture(
        replace(capture, object_points_m=object_points)
    )

    assert assessment.reason_code == "INVALID_DIMENSIONS"


def test_quick_calibration_rejects_views_concentrated_in_one_image_region() -> None:
    api = calibration_api()
    captures = []
    for capture in synthetic_captures():
        points = np.asarray(capture.image_points_px)
        points = points - points.mean(axis=0) + [640, 360]
        captures.append(api.CalibrationCapture(
            capture.image, points, capture.object_points_m, capture.identity,
            capture.corner_uncertainty_px, capture.name,
        ))
    with pytest.raises(CameraPoseError) as caught:
        api.calibrate_quick(captures)
    assert caught.value.code == "INSUFFICIENT_VIEW_DIVERSITY"


def test_view_gate_reports_stable_reason_and_metrics() -> None:
    api = calibration_api()
    capture = synthetic_captures(count=1)[0]
    low_texture = api.CalibrationCapture(
        image=np.full((720, 1280), 127, np.uint8),
        image_points_px=capture.image_points_px,
        object_points_m=capture.object_points_m,
        identity=capture.identity,
        corner_uncertainty_px=0.4,
        name="flat",
    )

    assessment = api.assess_calibration_capture(low_texture)

    assert not assessment.accepted
    assert assessment.reason_code == "LOW_TEXTURE"
    assert assessment.metrics["laplacianVariance"] < 50
    assert assessment.metrics["grayscaleStddev"] < 12


def test_view_gate_checks_area_clipping_contrast_uncertainty_and_image_size() -> None:
    api = calibration_api()
    capture = synthetic_captures(count=1)[0]
    cases = [
        (np.asarray([[600, 320], [680, 320], [680, 400], [600, 400]]), capture.image, .4, "TARGET_TOO_SMALL"),
        (np.asarray([[0, 100], [500, 100], [500, 600], [10, 600]]), capture.image, .4, "TARGET_CLIPPED"),
        (capture.image_points_px, np.pad(np.full((720, 1), 255, np.uint8), ((0, 0), (0, 1279))), .4, "LOW_CONTRAST"),
        (capture.image_points_px, capture.image, 2.1, "LOW_TEXTURE"),
        (capture.image_points_px, capture.image[:700], .4, "INTRINSICS_MISMATCH"),
    ]
    for points, image, uncertainty, expected in cases:
        assessment = api.assess_calibration_capture(api.CalibrationCapture(
            image, points, capture.object_points_m, capture.identity, uncertainty, expected,
        ))
        assert assessment.reason_code == expected


def test_quick_calibration_rejects_camera_identity_changes() -> None:
    api = calibration_api()
    captures = synthetic_captures()
    changed = captures[-1]
    captures[-1] = api.CalibrationCapture(
        image=changed.image,
        image_points_px=changed.image_points_px,
        object_points_m=changed.object_points_m,
        identity=api.CameraIdentity("camera-b", "wide", 1.0, 1, (1280, 720)),
        corner_uncertainty_px=changed.corner_uncertainty_px,
        name=changed.name,
    )
    with pytest.raises(CameraPoseError) as caught:
        api.calibrate_quick(captures)
    assert caught.value.code == "CAMERA_CHANGED"


def test_calibration_json_round_trip_and_exact_aspect_scaling(tmp_path: Path) -> None:
    api = calibration_api()
    result = api.calibrate_quick(synthetic_captures())
    path = tmp_path / "camera.json"
    api.save_calibration(result, path, synthetic_captures(count=1)[0].identity)

    loaded = api.load_calibration(
        path,
        api.CameraIdentity("camera-a", "wide", 1.0, 1, (640, 360)),
    )

    assert json.loads(path.read_text(encoding="utf-8"))["schema"] == "lab004.camera-intrinsics.v1"
    assert loaded.intrinsics.image_size_px == (640, 360)
    assert loaded.intrinsics.camera_matrix[0, 0] == pytest.approx(result.intrinsics.camera_matrix[0, 0] / 2)
    assert loaded.intrinsics.source == "quick-calibrated"


def test_estimated_calibration_json_round_trip_preserves_source(tmp_path: Path) -> None:
    api = calibration_api()
    size = (1280, 720)
    focal = 900.0
    result = CalibrationResult(
        CALIBRATION_SCHEMA,
        CameraIntrinsics(
            np.asarray([[focal, 0, 640], [0, focal, 360], [0, 0, 1.0]]),
            np.zeros(5),
            size,
            "estimated",
            "horizontal-fov-60",
        ),
        CalibrationMetrics(1.0, 1.0 / math.hypot(*size), 1),
    )
    identity = api.CameraIdentity("camera-a", "wide", 1.0, 1, size)
    path = tmp_path / "estimated.json"

    api.save_calibration(result, path, identity)
    loaded = api.load_calibration(path, identity)

    assert loaded.intrinsics.source == "estimated"
    assert loaded.intrinsics.estimation_method == "horizontal-fov-60"


def test_calibration_export_rejects_source_outside_public_contract(
    tmp_path: Path,
) -> None:
    api = calibration_api()
    result = api.calibrate_quick(synthetic_captures())
    legacy = replace(
        result,
        intrinsics=replace(result.intrinsics, source="calibrated"),
    )

    with pytest.raises(CameraPoseError) as caught:
        api.save_calibration(
            legacy, tmp_path / "legacy.json", synthetic_captures(count=1)[0].identity
        )

    assert caught.value.code == "INVALID_CALIBRATION_FILE"


def test_calibration_export_rejects_invalid_metric_ranges(tmp_path: Path) -> None:
    api = calibration_api()
    result = api.calibrate_quick(synthetic_captures())
    invalid = replace(result, metrics=CalibrationMetrics(0.1, 0.1 / math.hypot(1280, 720), -1))
    with pytest.raises(CameraPoseError) as caught:
        api.save_calibration(invalid, tmp_path / "camera.json", synthetic_captures(count=1)[0].identity)
    assert caught.value.code == "INVALID_CALIBRATION_FILE"


@pytest.mark.parametrize("accepted_views", [True, 1.5, "2"])
def test_calibration_export_requires_true_integer_accepted_views(
    tmp_path: Path, accepted_views: object
) -> None:
    api = calibration_api()
    result = api.calibrate_quick(synthetic_captures())
    invalid = replace(
        result,
        metrics=CalibrationMetrics(
            result.metrics.rms_px,
            result.metrics.normalized_rms,
            accepted_views,
        ),
    )

    with pytest.raises(CameraPoseError) as caught:
        api.save_calibration(
            invalid,
            tmp_path / "camera.json",
            synthetic_captures(count=1)[0].identity,
        )

    assert caught.value.code == "INVALID_CALIBRATION_FILE"


@pytest.mark.parametrize(
    ("mutator", "code"),
    [
        (lambda data: data.update(schema="wrong"), "INVALID_CALIBRATION_FILE"),
        (lambda data: data["intrinsics"]["cameraMatrix"][0].__setitem__(0, float("nan")), "INVALID_CALIBRATION_FILE"),
        (lambda data: data["identity"].update(cameraId="other"), "CAMERA_CHANGED"),
        (lambda data: data["identity"].update(lensId="tele"), "CAMERA_CHANGED"),
        (lambda data: data["identity"].update(zoom=2.0), "CAMERA_CHANGED"),
        (lambda data: data["identity"].update(orientation=6), "CAMERA_CHANGED"),
    ],
)
def test_calibration_json_rejects_malformed_or_camera_mismatch(
    tmp_path: Path, mutator: object, code: str
) -> None:
    api = calibration_api()
    path = tmp_path / "camera.json"
    identity = synthetic_captures(count=1)[0].identity
    api.save_calibration(api.calibrate_quick(synthetic_captures()), path, identity)
    data = json.loads(path.read_text(encoding="utf-8"))
    mutator(data)
    path.write_text(json.dumps(data, allow_nan=True), encoding="utf-8")

    with pytest.raises(CameraPoseError) as caught:
        api.load_calibration(path, identity)
    assert caught.value.code == code


def test_calibration_json_rejects_aspect_or_crop_mismatch(tmp_path: Path) -> None:
    api = calibration_api()
    path = tmp_path / "camera.json"
    identity = synthetic_captures(count=1)[0].identity
    api.save_calibration(api.calibrate_quick(synthetic_captures()), path, identity)

    with pytest.raises(CameraPoseError) as caught:
        api.load_calibration(path, api.CameraIdentity("camera-a", "wide", 1.0, 1, (640, 400)))
    assert caught.value.code == "INTRINSICS_MISMATCH"

    data = json.loads(path.read_text(encoding="utf-8"))
    data["identity"]["cropId"] = "center-crop"
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(CameraPoseError) as cropped:
        api.load_calibration(path, api.CameraIdentity("camera-a", "wide", 1.0, 1, (1280, 720)))
    assert cropped.value.code == "INTRINSICS_MISMATCH"


def test_calibration_json_rejects_malformed_identity(tmp_path: Path) -> None:
    api = calibration_api()
    path = tmp_path / "camera.json"
    identity = synthetic_captures(count=1)[0].identity
    api.save_calibration(api.calibrate_quick(synthetic_captures()), path, identity)
    data = json.loads(path.read_text(encoding="utf-8"))
    data["identity"]["cameraId"] = ""
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(CameraPoseError) as caught:
        api.load_calibration(path, identity)
    assert caught.value.code == "INVALID_CALIBRATION_FILE"

    data["identity"]["cameraId"] = "camera-a"
    data["identity"]["imageSizePx"] = [1280.5, 720]
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(CameraPoseError) as fractional:
        api.load_calibration(path, identity)
    assert fractional.value.code == "INVALID_CALIBRATION_FILE"


@pytest.mark.parametrize(
    "mutation",
    [
        lambda data: data["metrics"].update(acceptedViews=-1),
        lambda data: data["metrics"].update(normalizedRms=float("nan")),
        lambda data: data["intrinsics"].update(distortion=[1e6, 0, 0, 0, 0]),
        lambda data: data["intrinsics"]["cameraMatrix"][0].__setitem__(1, 3.0),
    ],
)
def test_calibration_json_rejects_invalid_ranges(tmp_path: Path, mutation: object) -> None:
    api = calibration_api()
    path = tmp_path / "camera.json"
    identity = synthetic_captures(count=1)[0].identity
    api.save_calibration(api.calibrate_quick(synthetic_captures()), path, identity)
    data = json.loads(path.read_text(encoding="utf-8"))
    mutation(data)
    path.write_text(json.dumps(data, allow_nan=True), encoding="utf-8")
    with pytest.raises(CameraPoseError) as caught:
        api.load_calibration(path, identity)
    assert caught.value.code == "INVALID_CALIBRATION_FILE"


@pytest.mark.parametrize("value", [True, "2", 1.5])
def test_calibration_json_requires_true_integer_accepted_views(
    tmp_path: Path, value: object
) -> None:
    api = calibration_api()
    path = tmp_path / "camera.json"
    identity = synthetic_captures(count=1)[0].identity
    api.save_calibration(api.calibrate_quick(synthetic_captures()), path, identity)
    data = json.loads(path.read_text(encoding="utf-8"))
    data["metrics"]["acceptedViews"] = value
    path.write_text(json.dumps(data), encoding="utf-8")

    with pytest.raises(CameraPoseError) as caught:
        api.load_calibration(path, identity)

    assert caught.value.code == "INVALID_CALIBRATION_FILE"


def test_calibration_json_rejects_legacy_calibrated_source(tmp_path: Path) -> None:
    api = calibration_api()
    path = tmp_path / "camera.json"
    identity = synthetic_captures(count=1)[0].identity
    api.save_calibration(api.calibrate_quick(synthetic_captures()), path, identity)
    data = json.loads(path.read_text(encoding="utf-8"))
    data["intrinsics"]["source"] = "calibrated"
    path.write_text(json.dumps(data), encoding="utf-8")

    with pytest.raises(CameraPoseError) as caught:
        api.load_calibration(path, identity)

    assert caught.value.code == "INVALID_CALIBRATION_FILE"


def test_enhanced_checkerboard_recovers_intrinsics(monkeypatch: pytest.MonkeyPatch) -> None:
    api = calibration_api()
    size = (1280, 720)
    matrix = np.asarray([[910.0, 0, 635.0], [0, 930.0, 355.0], [0, 0, 1.0]])
    distortion = np.asarray([0.01, -0.005, 0.0005, -0.0003, 0.0])
    object_points = api.checkerboard_object_points(6, 9, 0.025)
    detected: list[np.ndarray] = []
    for i in range(12):
        rvec = np.radians([180 + (i - 5) * 2.2, -18 + i * 3.1, i - 6])
        tvec = np.asarray([(i % 4 - 1.5) * .04, (i // 4 - 1) * .03, .75 + i * .015])
        detected.append(cv2.projectPoints(object_points, rvec, tvec, matrix, distortion)[0].astype(np.float32))
    iterator = iter(detected)
    monkeypatch.setattr(cv2, "findChessboardCorners", lambda *_args, **_kwargs: (True, next(iterator)))
    monkeypatch.setattr(cv2, "cornerSubPix", lambda _im, corners, *_args, **_kwargs: corners)

    images = [np.zeros((size[1], size[0]), np.uint8) for _ in detected]
    result = api.calibrate_enhanced_checkerboard(images, 6, 9, 0.025)

    assert result.intrinsics.source == "enhanced-calibrated"
    assert result.intrinsics.camera_matrix[0, 0] == pytest.approx(910, rel=.02)
    assert result.intrinsics.camera_matrix[1, 1] == pytest.approx(930, rel=.02)
    np.testing.assert_allclose(result.intrinsics.distortion[:4], distortion[:4], atol=.01)


def test_enhanced_checkerboard_maps_invalid_solver_output_to_calibration_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api = calibration_api()
    corners = np.zeros((54, 1, 2), np.float32)
    monkeypatch.setattr(cv2, "findChessboardCorners", lambda *_args, **_kwargs: (True, corners.copy()))
    monkeypatch.setattr(cv2, "cornerSubPix", lambda _im, values, *_args, **_kwargs: values)
    monkeypatch.setattr(cv2, "calibrateCamera", lambda *_args, **_kwargs: (float("nan"), np.eye(3), np.zeros(5), [], []))
    with pytest.raises(CameraPoseError) as caught:
        api.calibrate_enhanced_checkerboard([np.zeros((720, 1280), np.uint8)] * 8, 6, 9, .025)
    assert caught.value.code == "CALIBRATION_FAILED"
