import json
import numpy as np

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
