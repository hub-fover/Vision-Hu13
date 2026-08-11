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
