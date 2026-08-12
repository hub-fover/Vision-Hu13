import json
import numpy as np
import pytest

from defocus_depth.errors import DefocusDepthError
from defocus_depth.scale import FocusDepthScale, calibrate_scale


def test_scale_calibration_is_monotonic_and_serializable():
    scale = calibrate_scale([0.1, 0.5, 0.9], [1.0, 0.6, 0.3])
    values = scale.distance_for_focus(np.array([0.1, 0.5, 0.9]))
    assert np.all(np.diff(values) < 0)
    restored = FocusDepthScale.from_dict(json.loads(json.dumps(scale.to_dict())))
    assert restored.schema == "lab005.focus-depth-scale.v1"


def test_intrinsics_calibration_schema_round_trip():
    from defocus_depth.intrinsics import CameraIntrinsics

    camera = CameraIntrinsics(matrix=np.eye(3), distortion=np.zeros(5), image_size=(640, 480))
    loaded = CameraIntrinsics.from_dict(camera.to_dict())
    assert loaded.image_size == (640, 480)
    assert loaded.matrix.shape == (3, 3)


def test_intrinsics_scale_to_matching_analysis_resolution():
    from defocus_depth.intrinsics import CameraIntrinsics

    camera = CameraIntrinsics(
        matrix=np.array([[2000, 0, 1000], [0, 2020, 750], [0, 0, 1]], np.float64),
        distortion=np.zeros(5), image_size=(2000, 1500),
    )
    scaled = camera.for_image(1000, 750)

    assert scaled.image_size == (1000, 750)
    assert np.allclose(scaled.matrix, [[1000, 0, 500], [0, 1010, 375], [0, 0, 1]])
    with pytest.raises(DefocusDepthError, match="INTRINSICS_MISMATCH"):
        camera.for_image(1000, 700)


def test_intrinsics_accepts_web_fx_shape_and_writes_canonical_matrix():
    from defocus_depth.intrinsics import CameraIntrinsics

    web_value = {
        "schema": "lab005.camera-intrinsics.v1",
        "image": {"width": 1280, "height": 720},
        "intrinsics": {
            "fx": 910.0, "fy": 905.0, "cx": 642.0, "cy": 358.0,
            "distortion": [0.01, -0.02, 0.0, 0.0, 0.0],
        },
        "reprojectionRmsPx": 0.42,
    }
    camera = CameraIntrinsics.from_dict(web_value)
    assert camera.image_size == (1280, 720)
    assert np.allclose(camera.matrix, [[910, 0, 642], [0, 905, 358], [0, 0, 1]])
    canonical = camera.to_dict()
    assert canonical["intrinsics"]["imageSize"] == [1280, 720]
    assert "matrix" in canonical["intrinsics"]
    assert "image" not in canonical


def test_scale_accepts_web_samples_and_writes_canonical_arrays():
    web_value = {
        "schema": "lab005.focus-depth-scale.v1",
        "samples": [
            {"focus": 0.9, "distance": 1.0},
            {"focus": 0.1, "distance": 0.3},
            {"focus": 0.5, "distance": 0.6},
        ],
        "residualM": 0.02,
    }
    scale = FocusDepthScale.from_dict(web_value)
    assert np.allclose(scale.focus_indices, [0.1, 0.5, 0.9])
    assert np.allclose(scale.distances_m, [0.3, 0.6, 1.0])
    canonical = scale.to_dict()
    assert canonical["focusIndices"] == [0.1, 0.5, 0.9]
    assert canonical["distancesM"] == [0.3, 0.6, 1.0]
    assert "samples" not in canonical


def test_scale_import_rejects_non_monotonic_distance_mapping():
    with pytest.raises(DefocusDepthError) as caught:
        FocusDepthScale.from_dict({
            "schema": "lab005.focus-depth-scale.v1",
            "focusIndices": [0.1, 0.5, 0.9],
            "distancesM": [0.3, 1.0, 0.6],
        })
    assert caught.value.code == "DEPTH_SCALE_UNCALIBRATED"


def test_scale_reports_nonzero_linear_trend_residual_for_nonlinear_samples():
    scale = calibrate_scale([0.0, 0.5, 1.0], [0.3, 0.8, 1.0])

    assert scale.residual_m > 0.05


def test_scale_compatibility_requires_matching_intrinsics_metadata():
    from defocus_depth.intrinsics import CameraIntrinsics

    camera = CameraIntrinsics(
        np.array([[100, 0, 50], [0, 100, 40], [0, 0, 1]], np.float64),
        np.zeros(5), (100, 80), lens_id="rear-wide", orientation=1, zoom=1.0,
    )
    scale = FocusDepthScale(
        np.array([0.0, 0.5, 1.0]), np.array([0.3, 0.6, 1.0]),
        intrinsics_schema="lab005.camera-intrinsics.v1", image_size=(100, 80),
        lens_id="rear-wide", orientation=1, zoom=1.0,
    )

    scale.validate_for_camera(camera)
    scale.image_size = (200, 160)
    with pytest.raises(DefocusDepthError) as caught:
        scale.validate_for_camera(camera)
    assert caught.value.code == "INTRINSICS_MISMATCH"


def test_intrinsics_calibration_preserves_opencv_rms(tmp_path, monkeypatch):
    from defocus_depth import intrinsics

    for index in range(3):
        (tmp_path / f"view-{index}.png").touch()
    image = np.zeros((80, 120, 3), np.uint8)
    corners = np.zeros((54, 1, 2), np.float32)
    monkeypatch.setattr(intrinsics, "load_image", lambda _: image)
    monkeypatch.setattr(intrinsics.cv2, "findChessboardCorners", lambda *args, **kwargs: (True, corners))
    monkeypatch.setattr(intrinsics.cv2, "cornerSubPix", lambda *args, **kwargs: corners)
    monkeypatch.setattr(
        intrinsics.cv2,
        "calibrateCamera",
        lambda *args, **kwargs: (0.42, np.eye(3), np.zeros(5), [np.zeros((3, 1))] * 3, [np.ones((3, 1))] * 3),
    )
    monkeypatch.setattr(intrinsics.cv2, "projectPoints", lambda object_view, *args: (corners.copy(), None))

    result = intrinsics.calibrate_intrinsics(tmp_path)

    assert result.rms_error == pytest.approx(0.42)


def test_intrinsics_calibration_accepts_zero_rms_for_perfect_synthetic_data(tmp_path, monkeypatch):
    from defocus_depth import intrinsics

    for index in range(3):
        (tmp_path / f"view-{index}.png").touch()
    image = np.zeros((80, 120, 3), np.uint8)
    corners = np.zeros((54, 1, 2), np.float32)
    monkeypatch.setattr(intrinsics, "load_image", lambda _: image)
    monkeypatch.setattr(intrinsics.cv2, "findChessboardCorners", lambda *args, **kwargs: (True, corners))
    monkeypatch.setattr(intrinsics.cv2, "cornerSubPix", lambda *args, **kwargs: corners)
    monkeypatch.setattr(
        intrinsics.cv2,
        "calibrateCamera",
        lambda *args, **kwargs: (0.0, np.eye(3), np.zeros(5), [np.zeros((3, 1))] * 3, [np.ones((3, 1))] * 3),
    )
    monkeypatch.setattr(intrinsics.cv2, "projectPoints", lambda object_view, *args: (corners.copy(), None))

    assert intrinsics.calibrate_intrinsics(tmp_path).rms_error == 0.0


def test_intrinsics_rejects_non_finite_distortion():
    from defocus_depth.intrinsics import CameraIntrinsics

    with pytest.raises(DefocusDepthError) as caught:
        CameraIntrinsics.from_dict({
            "schema": "lab005.camera-intrinsics.v1",
            "intrinsics": {
                "matrix": [[100, 0, 50], [0, 100, 40], [0, 0, 1]],
                "distortion": [float("nan"), 0, 0, 0, 0],
                "imageSize": [100, 80],
            },
        })
    assert caught.value.code == "INTRINSICS_MISMATCH"


def test_intrinsics_calibration_rejects_invalid_board_dimensions(tmp_path):
    from defocus_depth.intrinsics import calibrate_intrinsics

    with pytest.raises(DefocusDepthError) as caught:
        calibrate_intrinsics(tmp_path, pattern=(0, 6), square_size=0.025)
    assert caught.value.code == "CALIBRATION_FAILED"


def test_intrinsics_calibration_rejects_missing_folder_with_stable_code(tmp_path):
    from defocus_depth.intrinsics import calibrate_intrinsics

    with pytest.raises(DefocusDepthError) as caught:
        calibrate_intrinsics(tmp_path / "missing")
    assert caught.value.code == "CALIBRATION_FAILED"


def test_intrinsics_calibration_rejects_mixed_image_sizes(tmp_path, monkeypatch):
    from defocus_depth import intrinsics

    paths = []
    for index in range(3):
        path = tmp_path / f"view-{index}.png"
        path.touch()
        paths.append(path)
    images = {
        paths[0].name: np.zeros((80, 120, 3), np.uint8),
        paths[1].name: np.zeros((80, 120, 3), np.uint8),
        paths[2].name: np.zeros((80, 100, 3), np.uint8),
    }
    corners = np.zeros((54, 1, 2), np.float32)
    monkeypatch.setattr(intrinsics, "load_image", lambda path: images[path.name])
    monkeypatch.setattr(intrinsics.cv2, "findChessboardCorners", lambda *args, **kwargs: (True, corners))
    monkeypatch.setattr(intrinsics.cv2, "cornerSubPix", lambda *args, **kwargs: corners)

    with pytest.raises(DefocusDepthError) as caught:
        intrinsics.calibrate_intrinsics(tmp_path)
    assert caught.value.code == "INTRINSICS_MISMATCH"
