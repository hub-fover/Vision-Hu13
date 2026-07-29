from pathlib import Path
import re

from scripts.validate_article_html import validate


ROOT = Path(__file__).resolve().parents[2]
ARTICLE = ROOT / "article" / "article.md"
HTML = (
    ROOT
    / "article"
    / "Perspective_Paste_排版_石墨极简风(graphite-minimal).html"
)


def test_article_includes_required_delivery_sections() -> None:
    text = ARTICLE.read_text(encoding="utf-8")
    for expected in (
        "先贴得准，再融得真",
        "OpenCV",
        "W3C",
        "Pillow",
        "MDN",
        "https://hub-fover.github.io/Vision-Hu13/",
        "https://github.com/hub-fover/Vision-Hu13",
        "失败边界",
        "../demo/demo.gif",
    ):
        assert expected in text


def test_wechat_fragment_obeys_platform_constraints() -> None:
    assert validate(HTML) == []


def test_graphite_layout_preserves_images_and_reference_tokens() -> None:
    markdown = ARTICLE.read_text(encoding="utf-8")
    fragment = HTML.read_text(encoding="utf-8")
    markdown_images = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", markdown)
    html_images = re.findall(r'<img\s+src="([^"]+)"', fragment)
    assert html_images == markdown_images
    assert "max-width:677px" in fragment
    assert "background:#18181B" in fragment
    assert "border-bottom:5px solid #64748B" in fragment
    assert "font-size:15px;line-height:1.86" in fragment
    assert fragment.lower().count("#f97316") <= 3
    assert "{{" not in markdown
    assert "{{" not in fragment
    assert "我是 Vision Hub" in fragment


def test_all_article_media_paths_exist() -> None:
    markdown = ARTICLE.read_text(encoding="utf-8")
    for target in re.findall(r"!\[[^\]]*\]\(([^)]+)\)", markdown):
        if "://" not in target:
            assert (ARTICLE.parent / target).resolve().is_file(), target
