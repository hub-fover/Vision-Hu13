from __future__ import annotations

import json
import subprocess
import sys
import tomllib
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
        for runtime in ("python", "web"):
            cap = report["budgetBoundary"]["outputCaps"][runtime][quality]
            assert megapixels * 0.99 <= cap["outputMegapixels"] <= megapixels
    for runtime in ("python", "web"):
        memory = report["budgetBoundary"]["memoryPressure"][runtime]
        assert memory["outputScale"] < 1
        assert 380 <= memory["estimatedWorkingSetMiB"] <= 384
        assert report["budgetBoundary"]["overLimitRejected"][runtime] is True
    assert report["opencvRuntime"] == {
        "package": "@techstark/opencv-js",
        "version": "4.12.0-release.1",
        "realMat": True,
        "distanceTransform": True,
    }
    assert report["pythonOpenCvVersion"] == "4.12.0"


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


def test_python_regeneration_dependencies_are_exact_4_12_and_lock_synced() -> None:
    with (LAB_ROOT / "pyproject.toml").open("rb") as project_file:
        project = tomllib.load(project_file)
    declared = set(project["project"]["dependencies"])
    declared.update(project["project"]["optional-dependencies"]["test"])
    locked = {
        line.strip()
        for line in (LAB_ROOT / "requirements-lock.txt").read_text("utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    }

    assert declared == locked
    opencv = next(item for item in declared if item.startswith("opencv-python=="))
    assert opencv == "opencv-python==4.12.0.88"


def test_cross_runtime_helper_requires_the_real_opencv_runtime() -> None:
    source = (LAB_ROOT / "scripts" / "cross_runtime_web.mjs").read_text("utf-8")

    assert "AcceptanceMat" not in source
    assert "class Acceptance" not in source
    assert "@techstark/opencv-js" in source
    assert "onRuntimeInitialized" in source
    assert "new cv.Mat" in source
