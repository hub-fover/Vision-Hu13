from __future__ import annotations

import importlib.util

from camera_pose import contracts


def test_camera_pose_package_exposes_documented_types_and_errors() -> None:
    assert importlib.util.find_spec("camera_pose") is not None

    import camera_pose

    expected_types = {
        "PlaneTarget",
        "ImagePoint",
        "CameraIntrinsics",
        "CalibrationView",
        "CalibrationMetrics",
        "CalibrationResult",
        "PoseEstimate",
        "TrackingMetrics",
        "MeasurementInterval",
        "MeasurementReport",
    }
    assert expected_types <= set(camera_pose.__all__)
    assert len(camera_pose.ERROR_CODES) == 18
    error = camera_pose.CameraPoseError("POSE_FAILED", "synthetic failure")
    assert error.code == "POSE_FAILED"
    assert str(error) == "synthetic failure"


def test_python_runtime_constants_match_public_json_contract() -> None:
    assert contracts.CORNER_ORDER == ("TL", "TR", "BR", "BL")
    assert contracts.ANALYSIS_MAX_SIDE == 1280
    assert contracts.MAX_WORKING_SET_MIB == 320
    assert contracts.STABLE_MAX_NORMALIZED_RMS == 0.0015
    assert contracts.REFERENCE_ONLY_MAX_NORMALIZED_RMS == 0.0035
    assert contracts.POSE_AMBIGUITY_MAX_ABSOLUTE_DIFFERENCE_PX == 0.25
    assert contracts.POSE_AMBIGUITY_MAX_RELATIVE_DIFFERENCE == 0.10
    assert contracts.CALIBRATION_SCHEMA == "lab004.camera-intrinsics.v1"
    assert contracts.TRACKING_DEFAULTS == {
        "targetAnalysisFps": 12,
        "maxTrackedFeatures": 300,
        "minTrackedFeatures": 12,
        "minHomographyInlierRatio": 0.60,
        "maxMedianForwardBackwardErrorPx": 1.5,
        "maxConsecutiveBadFrames": 3,
    }
