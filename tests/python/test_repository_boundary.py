from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LAB_002_PUBLICATION_PREFIXES = (
    "lab-002/article/",
    "lab-002/assets/",
    "lab-002/docs/figures/",
)


def is_forbidden_publication_path(path: str) -> bool:
    """Keep LAB 001 publication-side content out of the product root."""
    normalized = path.replace("\\", "/").lower()
    if normalized.startswith(LAB_002_PUBLICATION_PREFIXES):
        return False
    return any(
        token in normalized
        for token in (
            "article/",
            "graphite-minimal",
            "validate_article",
            "\u516c\u4f17\u53f7",
        )
    )


def test_lab_002_allows_publication_files_only_in_its_isolated_directories() -> None:
    assert not is_forbidden_publication_path("lab-002/article/README.md")
    assert not is_forbidden_publication_path("lab-002/assets/asset-manifest.json")
    assert not is_forbidden_publication_path("lab-002/docs/figures/01-overlap.png")
    assert is_forbidden_publication_path("article/README.md")
    assert is_forbidden_publication_path("docs/graphite-minimal.html")
    assert is_forbidden_publication_path("lab-002/scripts/validate_article.py")


def test_product_repository_excludes_publication_side_content_except_lab_002_plan() -> None:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    tracked_paths = [
        path
        for path in result.stdout.replace("\\", "/").lower().splitlines()
        if (ROOT / path).exists()
    ]
    matches = [path for path in tracked_paths if is_forbidden_publication_path(path)]
    assert matches == [], f"publication-side paths found in product repository: {matches}"

    plan_paths = [path for path in tracked_paths if path.startswith("docs/superpowers/")]
    assert plan_paths == [
        "docs/superpowers/plans/2026-07-29-lab-002-panorama-stitch-implementation.md"
    ]
