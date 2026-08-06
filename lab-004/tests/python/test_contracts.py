from __future__ import annotations

import json
from pathlib import Path


LAB_ROOT = Path(__file__).resolve().parents[2]
CONTRACTS_PATH = LAB_ROOT / "shared" / "contracts.json"

ERROR_CODES = {
    "INVALID_DIMENSIONS",
    "INVALID_QUAD",
    "TARGET_TOO_SMALL",
    "TARGET_CLIPPED",
    "LOW_CONTRAST",
    "LOW_TEXTURE",
    "INSUFFICIENT_VIEW_DIVERSITY",
    "CALIBRATION_FAILED",
    "INVALID_CALIBRATION_FILE",
    "INTRINSICS_MISMATCH",
    "POSE_FAILED",
    "POSE_AMBIGUOUS",
    "HIGH_REPROJECTION_ERROR",
    "TRACKING_LOST",
    "CAMERA_CHANGED",
    "PERMISSION_DENIED",
    "UNSUPPORTED_CAMERA",
    "CANCELLED",
}

PUBLIC_TYPES = {
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


def load_contracts() -> dict[str, object]:
    assert CONTRACTS_PATH.is_file(), "LAB 004 contracts must be a public JSON artifact"
    return json.loads(CONTRACTS_PATH.read_text(encoding="utf-8"))


def test_package_contains_only_declared_public_metadata_files() -> None:
    expected = {
        "LICENSES.md",
        "README.md",
        "pyproject.toml",
        "requirements-lock.txt",
    }
    assert expected <= {path.name for path in LAB_ROOT.iterdir() if path.is_file()}


def test_contracts_fix_coordinates_units_limits_and_quality_thresholds() -> None:
    contracts = load_contracts()
    assert contracts["cornerOrder"] == ["TL", "TR", "BR", "BL"]
    assert contracts["objectFrame"] == {
        "origin": "target-center",
        "xAxis": "plane-right",
        "yAxis": "plane-up",
        "zAxis": "plane-out",
    }
    assert contracts["lengthUnit"] == "metre"
    assert contracts["pixelFrame"] == "exif-corrected-analysis-image"
    assert contracts["analysisMaxSide"] == 1280
    assert contracts["maxWorkingSetMiB"] == 320
    assert contracts["quality"] == {
        "metric": "normalized-rms",
        "stableMax": 0.0015,
        "referenceOnlyMax": 0.0035,
    }
    assert contracts["poseAmbiguity"] == {
        "maxAbsoluteReprojectionDifferencePx": 0.25,
        "maxRelativeReprojectionDifference": 0.10,
    }


def test_contracts_fix_tracking_and_calibration_schema() -> None:
    contracts = load_contracts()
    assert contracts["trackingDefaults"] == {
        "targetAnalysisFps": 12,
        "maxTrackedFeatures": 300,
        "minTrackedFeatures": 12,
        "minHomographyInlierRatio": 0.60,
        "maxMedianForwardBackwardErrorPx": 1.5,
        "maxConsecutiveBadFrames": 3,
    }
    assert contracts["calibrationSchema"] == "lab004.camera-intrinsics.v1"


def test_contracts_document_all_public_types_and_stable_errors() -> None:
    contracts = load_contracts()
    assert set(contracts["types"]) == PUBLIC_TYPES
    assert all(contracts["types"][name]["description"] for name in PUBLIC_TYPES)
    assert set(contracts["errorCodes"]) == ERROR_CODES
