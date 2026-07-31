from __future__ import annotations

import json
from pathlib import Path

import exposure_fusion as fusion


ROOT = Path(__file__).resolve().parents[2]


def test_python_contract_matches_shared_json() -> None:
    shared = json.loads((ROOT / "shared" / "contracts.json").read_text("utf-8"))

    assert fusion.FusionOptions().to_shared_dict() == shared["defaults"]
    assert fusion.ERROR_CODES == tuple(shared["errorCodes"])


def test_all_teaching_apis_are_public() -> None:
    names = {
        "analyze_exposures",
        "align_exposures",
        "compute_quality_weights",
        "detect_motion",
        "fuse_pyramids",
        "crop_common_region",
        "fuse_exposures",
        "process_stack",
    }

    assert {name for name in names if not hasattr(fusion, name)} == set()


def test_every_error_code_is_constructible() -> None:
    for code in fusion.ERROR_CODES:
        assert fusion.FusionError(code, "test").code == code
