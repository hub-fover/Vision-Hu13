from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_product_repository_excludes_publication_side_content_except_lab_002_plan() -> None:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    tracked = "\n".join(
        path
        for path in result.stdout.replace("\\", "/").lower().splitlines()
        if (ROOT / path).exists()
    )
    forbidden = (
        "art" + "icle/",
        "graphite" + "-minimal",
        "validate_" + "article",
        "\u516c\u4f17" + "\u53f7",
    )
    matches = [token for token in forbidden if token in tracked]
    assert matches == [], f"publication-side paths found in product repository: {matches}"

    plan_paths = [path for path in tracked.splitlines() if path.startswith("docs/superpowers/")]
    assert plan_paths == [
        "docs/superpowers/plans/2026-07-29-lab-002-panorama-stitch-implementation.md"
    ]
