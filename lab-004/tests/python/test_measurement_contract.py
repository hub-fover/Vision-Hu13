import json
from pathlib import Path

import numpy as np
import pytest

from camera_measurement.contracts import SCHEMA_VERSION, ScaleReference, StaticSceneRegion
from camera_measurement.errors import MeasurementError
from camera_measurement.scale import pixels_to_metres, validate_unit
from camera_measurement.target import validate_target_region


def test_static_scene_contract_and_errors_are_v2():
    contract = json.loads((Path(__file__).parents[2] / "shared" / "contracts.json").read_text(encoding="utf-8"))
    assert contract["schemaVersion"] == "lab004.static-scene-speed.v2"
    assert SCHEMA_VERSION == contract["schemaVersion"]
    assert contract["defaultMethod"] == "flow"
    assert "CAMERA_ROTATION_TOO_LARGE" in contract["errorCodes"]
    assert "TEMPLATE_LOST" not in contract["errorCodes"]


def test_scale_and_roi_validation():
    with pytest.raises(MeasurementError, match="INVALID_SCALE"):
        ScaleReference.from_points((10, 10), (10, 10), 20, "m")
    with pytest.raises(MeasurementError, match="INVALID_SCALE"):
        validate_unit("furlong")
    scale = ScaleReference.from_points((0, 0), (100, 0), 25, "mm")
    assert scale.real_distance_m == pytest.approx(0.025)
    assert pixels_to_metres(np.array([4.0, -2.0]), scale) == pytest.approx(np.array([0.001, -0.0005]))
    with pytest.raises(MeasurementError, match="TARGET_TOO_SMALL"):
        validate_target_region(StaticSceneRegion(0, 0, 20, 20), (320, 240), min_size=32)
    assert validate_target_region(StaticSceneRegion(40, 30, 100, 90), (320, 240)).area_px == 9000
