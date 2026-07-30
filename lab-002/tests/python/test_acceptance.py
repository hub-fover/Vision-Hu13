from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from scripts.validate_acceptance import validate_acceptance


LAB_ROOT = Path(__file__).resolve().parents[2]


def test_cross_runtime_acceptance_meets_release_thresholds() -> None:
    report, errors = validate_acceptance(LAB_ROOT)

    assert errors == []
    assert report["maximumTransformDifferencePx"] <= 2
    assert report["maximumMedianReprojectionErrorPx"] <= 2.5
    assert report["meanValidAreaColorDifferencePercent"] <= 5
    assert report["seamBoundaryExcludedPixels"] >= 1
    assert report["safeCropHasBlankHoles"] is False
    assert report["mountainSample"]["validPanorama"] is True
    assert report["mountainSample"]["inputCount"] == 3
    assert report["mountainSample"]["outputPixels"] > 0
    for quality, megapixels in (("mobile", 12), ("hd", 24)):
        assert report["budgets"][quality]["outputMegapixels"] <= megapixels
        assert report["budgets"][quality]["estimatedWorkingSetMiB"] <= 384


def test_acceptance_cli_emits_machine_readable_report() -> None:
    completed = subprocess.run(
        [sys.executable, "scripts/validate_acceptance.py", "--json"],
        cwd=LAB_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    report = json.loads(completed.stdout)
    assert report["privacyStaticResources"] == "PASS"
    assert report["thresholds"] == {
        "maximumTransformDifferencePx": 2,
        "maximumMedianReprojectionErrorPx": 2.5,
        "meanValidAreaColorDifferencePercent": 5,
        "maxWorkingSetMiB": 384,
        "opencvCompressedBytes": 8 * 1024 * 1024,
    }
