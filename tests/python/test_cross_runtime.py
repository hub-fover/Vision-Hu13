import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).parents[2]


def test_cross_runtime_geometry_and_color_thresholds():
    completed = subprocess.run(
        [sys.executable, "scripts/validate_cross_runtime.py", "--json"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    report = json.loads(completed.stdout)
    assert report["maximumReprojectionErrorPx"] <= 0.5
    assert report["meanValidRegionColorErrorPercent"] <= 3.0
    assert report["ignoredEdgePixels"] == 2
