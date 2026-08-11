import json
from pathlib import Path

from defocus_depth.errors import DefocusDepthError
from defocus_depth.io import validate_stack


def test_contract_defaults_and_error_codes_are_stable():
    contract = json.loads((Path(__file__).parents[2] / "shared/contracts.json").read_text())
    assert contract["defaults"]["inputCount"] == 5
    assert "FOCUS_SPREAD_TOO_SMALL" in contract["errorCodes"]


def test_validate_stack_rejects_wrong_frame_count():
    try:
        validate_stack([object()] * 4)
    except DefocusDepthError as exc:
        assert exc.code == "INVALID_FRAME_COUNT"
    else:
        raise AssertionError("expected INVALID_FRAME_COUNT")
