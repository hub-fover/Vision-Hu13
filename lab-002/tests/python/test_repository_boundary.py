from __future__ import annotations

from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
FORBIDDEN_PATH_PARTS = {
    "article",
    "graphite-minimal",
    "公众号",
}
FORBIDDEN_FILENAMES = {
    "validate_article.py",
}


def test_public_repository_excludes_wechat_article_delivery_files() -> None:
    offending: list[str] = []
    for path in (REPOSITORY_ROOT / "lab-002").rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(REPOSITORY_ROOT)
        lowered_parts = {part.lower() for part in relative.parts}
        if (
            lowered_parts & FORBIDDEN_PATH_PARTS
            or path.name.lower() in FORBIDDEN_FILENAMES
        ):
            offending.append(relative.as_posix())

    assert offending == []


def test_public_release_commands_do_not_depend_on_article_validation() -> None:
    package = (REPOSITORY_ROOT / "package.json").read_text("utf-8")
    workflow = (REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text(
        "utf-8"
    )

    assert "validate:lab002:article" not in package
    assert "validate_article" not in package
    assert "article/gzh" not in workflow
