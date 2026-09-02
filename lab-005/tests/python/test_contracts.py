import json
from pathlib import Path

from defocus_depth.errors import DefocusDepthError, ERROR_MESSAGES
from defocus_depth.io import validate_stack


def test_contract_defaults_and_error_codes_are_stable():
    contract = json.loads((Path(__file__).parents[2] / "shared/contracts.json").read_text())
    assert contract["defaults"]["inputCount"] == 5
    assert "FOCUS_SPREAD_TOO_SMALL" in contract["errorCodes"]
    assert set(contract["errorCodes"]) == set(ERROR_MESSAGES)
    assert all(ERROR_MESSAGES[code] for code in contract["errorCodes"])


def test_contract_publishes_all_shared_types():
    contract = json.loads((Path(__file__).parents[2] / "shared/contracts.json").read_text())
    assert set(contract["publicTypes"]) == {
        "FocusFrame", "FocusStack", "FocusMetricCurve", "RelativeDepthMap",
        "DepthSample", "CameraIntrinsics", "FocusCalibration",
        "DepthScaleCalibration", "DepthResult", "DepthReport",
    }


def test_python_package_exports_the_shared_public_types():
    import defocus_depth

    expected = {
        "FocusFrame", "FocusStack", "FocusMetricCurve", "RelativeDepthMap",
        "DepthSample", "CameraIntrinsics", "FocusCalibration",
        "DepthScaleCalibration", "DepthResult", "DepthReport",
    }
    assert expected <= set(defocus_depth.__all__)
    assert all(hasattr(defocus_depth, name) for name in expected)


def test_validate_stack_rejects_wrong_frame_count():
    try:
        validate_stack([object()] * 4)
    except DefocusDepthError as exc:
        assert exc.code == "INVALID_FRAME_COUNT"
    else:
        raise AssertionError("expected INVALID_FRAME_COUNT")
