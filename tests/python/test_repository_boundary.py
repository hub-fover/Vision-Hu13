from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LAB_002_PUBLICATION_PREFIXES = (
    "lab-002/assets/",
    "lab-002/docs/figures/",
)


def is_forbidden_publication_path(path: str) -> bool:
    """Keep LAB 001 publication-side content out of the product root."""
    normalized = path.replace("\\", "/").lower()
    if (
        normalized.startswith(LAB_002_PUBLICATION_PREFIXES)
    ):
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


def existing_tracked_paths(paths: list[str], *, root: Path = ROOT) -> list[str]:
    """Filter using the tracked path's original spelling for case-sensitive filesystems."""
    return [path for path in paths if (root / path).exists()]


def test_lab_002_allows_only_product_assets_and_figures() -> None:
    assert is_forbidden_publication_path("lab-002/article/README.md")
    assert not is_forbidden_publication_path("lab-002/assets/asset-manifest.json")
    assert not is_forbidden_publication_path("lab-002/docs/figures/01-overlap.png")
    assert is_forbidden_publication_path("article/README.md")
    assert is_forbidden_publication_path("docs/graphite-minimal.html")
    assert is_forbidden_publication_path("lab-002/scripts/validate_article.py")


def test_tracked_path_existence_preserves_original_case(tmp_path: Path) -> None:
    tracked = tmp_path / "MixedCase" / "README.MD"
    tracked.parent.mkdir()
    tracked.write_text("fixture", encoding="utf-8")

    assert existing_tracked_paths(["MixedCase/README.MD"], root=tmp_path) == [
        "MixedCase/README.MD"
    ]


def test_product_repository_excludes_publication_side_content() -> None:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    tracked_paths = existing_tracked_paths(
        result.stdout.replace("\\", "/").splitlines()
    )
    normalized_paths = [path.lower() for path in tracked_paths]
    matches = [path for path in normalized_paths if is_forbidden_publication_path(path)]
    assert matches == [], f"publication-side paths found in product repository: {matches}"

    plan_paths = [
        path for path in normalized_paths if path.startswith("docs/superpowers/")
    ]
    assert plan_paths == []
