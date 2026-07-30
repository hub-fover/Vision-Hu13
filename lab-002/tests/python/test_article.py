from __future__ import annotations

from pathlib import Path

from scripts.validate_article import validate_article


LAB_ROOT = Path(__file__).resolve().parents[2]
ARTICLE_ROOT = LAB_ROOT / "article"


def test_article_release_is_complete_and_platform_safe() -> None:
    assert validate_article(LAB_ROOT) == []


def test_article_uses_only_real_repository_images() -> None:
    markdown = (ARTICLE_ROOT / "article.md").read_text("utf-8")

    assert "../docs/figures/" in markdown
    assert "../assets/samples/" in markdown
    assert ".gif" not in markdown.lower()
    assert ".mp4" not in markdown.lower()
    assert ".webm" not in markdown.lower()
    assert "PENDING_DEVICE_CAPTURE" in markdown


def test_article_claims_are_supported_without_personal_anecdotes() -> None:
    brief = (ARTICLE_ROOT / "brief.yaml").read_text("utf-8")
    claims = (ARTICLE_ROOT / "claims.yaml").read_text("utf-8")
    article = (ARTICLE_ROOT / "article.md").read_text("utf-8")

    assert "available: false" in brief
    assert "status: unsupported" not in claims
    assert "type: user_experience" not in claims
    for fabricated_marker in ("我曾", "我在现场", "我的朋友", "我的同事", "有人对我说"):
        assert fabricated_marker not in article


def test_clean_wechat_fragment_has_no_platform_red_lines() -> None:
    html = (ARTICLE_ROOT / "几张照片怎样接成一张_排版_石墨极简风(graphite-minimal).html").read_text(
        "utf-8"
    )

    assert html.lstrip().startswith("<section")
    assert html.rstrip().endswith("</section>")
    assert "max-width:677px" in html
    assert "font-size:15px" in html
    assert "line-height:1.8" in html
    for forbidden in (
        "<style",
        "<script",
        "<div",
        " class=",
        " id=",
        "position:absolute",
        "position:fixed",
        "position:sticky",
        "display:grid",
        "@media",
        "@keyframes",
    ):
        assert forbidden not in html.lower()
