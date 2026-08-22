import json
from pathlib import Path

import numpy as np
import pytest

from camera_measurement.errors import MeasurementError
from camera_measurement.scale import ScaleReference, pixels_to_metres, validate_unit
from camera_measurement.target import TargetRegion, validate_target_region


def test_contract_is_measurement_v1_with_fixed_defaults():
    contract = json.loads(
        (Path(__file__).parents[2] / "shared" / "contracts.json").read_text(encoding="utf-8")
    )
    assert contract["schemaVersion"] == "lab004.measurement.v1"
    assert contract["targetAnalysisFps"] == 30
    assert contract["defaultMethod"] == "template"
    assert contract["minSamplesForSpectrum"] == 128
    assert set(contract["errorCodes"]) == {
        "INVALID_FRAME", "UNSUPPORTED_FORMAT", "DECODE_FAILED", "INVALID_SCALE",
        "TARGET_TOO_SMALL", "LOW_TEXTURE", "LOW_CONTRAST", "TEMPLATE_LOST",
        "CAMERA_MOVED", "BACKGROUND_UNTRACKABLE", "SCENE_CHANGED", "FPS_UNSTABLE",
            "INSUFFICIENT_SAMPLES", "RUNTIME_MISSING", "PERMISSION_DENIED", "CANCELLED",
            "VIDEO_RECORDING_UNSUPPORTED", "VIDEO_RECORDING_FAILED", "VIDEO_RECORDING_CANCELLED",
        }


def test_two_point_scale_rejects_zero_length_and_converts_metres():
    with pytest.raises(MeasurementError, match="INVALID_SCALE"):
        ScaleReference.from_points((10, 10), (10, 10), 20, "mm")
    with pytest.raises(MeasurementError, match="INVALID_SCALE"):
        validate_unit("furlong")
    scale = ScaleReference.from_points((0, 0), (100, 0), 25, "mm")
    assert scale.real_distance_m == pytest.approx(0.025)
    assert pixels_to_metres(np.array([4.0, -2.0]), scale) == pytest.approx(
        np.array([0.001, -0.0005])
    )


def test_roi_rejects_clipped_or_tiny_regions_and_accepts_valid_region():
    with pytest.raises(MeasurementError, match="TARGET_TOO_SMALL"):
        validate_target_region(TargetRegion(0, 0, 20, 20), (320, 240))
    with pytest.raises(MeasurementError, match="TARGET_TOO_SMALL"):
        validate_target_region(TargetRegion(300, 10, 40, 80), (320, 240))
    with pytest.raises(MeasurementError, match="TARGET_TOO_SMALL"):
        validate_target_region(TargetRegion(-1, 10, 80, 80), (320, 240))
    region = validate_target_region(TargetRegion(40, 30, 100, 90), (320, 240))
    assert region.area_px == 9000
