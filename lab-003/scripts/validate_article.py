from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_IMAGE_BASE = "https://hub-fover.github.io/Vision-Hu13/lab-003/assets/figures/"


class GzhParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.errors = []
        self.images = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag in {"style", "script", "div"}:
            self.errors.append(f"banned tag: {tag}")
        if "class" in attrs or "id" in attrs:
            self.errors.append(f"banned attribute on {tag}")
        style = attrs.get("style", "").lower()
        if any(value in style for value in ("position:absolute", "position:fixed", "display:grid", "float:")):
            self.errors.append(f"banned style on {tag}")
        if tag == "img":
            self.images.append(attrs.get("src", ""))


def main() -> None:
    required = ["article.md", "brief.yaml", "claims.yaml", "fact-review.md", "sources.yaml", "de-ai-report.md"]
    for name in required:
        assert (ROOT / "article" / name).is_file(), name
    markdown = (ROOT / "article" / "article.md").read_text(encoding="utf-8")
    assert markdown.count("\n## ") == 9
    assert len(re.findall(r"!\[[^]]*]\(([^)]+)\)", markdown)) == 10
    clean = next((ROOT / "article").glob("*_排版_石墨极简(graphite-minimal).html"))
    preview = next((ROOT / "article").glob("*_排版_石墨极简(graphite-minimal)_预览.html"))
    parser = GzhParser()
    parser.feed(clean.read_text(encoding="utf-8"))
    assert not parser.errors, parser.errors
    assert len(parser.images) == 10
    for source in parser.images:
        assert (clean.parent / source).resolve().is_file(), source
    copy_page = ROOT / "web" / "article-copy.html"
    assert copy_page.is_file()
    copy_html = copy_page.read_text(encoding="utf-8")
    assert 'id="copy-button"' in copy_html
    assert "navigator.clipboard" in copy_html and 'execCommand("copy")' in copy_html
    assert copy_html.count(PUBLIC_IMAGE_BASE) == 10
    copied_content = copy_html.split('<main id="copy-content">', 1)[1].split("</main>", 1)[0]
    assert "copy-button" not in copied_content and "copy-toolbar" not in copied_content
    assert "复制到公众号" in preview.read_text(encoding="utf-8")
    pdf = ROOT / "output" / "pdf" / "lab-003-review.pdf"
    reader = PdfReader(str(pdf))
    assert len(reader.pages) >= 8
    extracted = "".join(page.extract_text() or "" for page in reader.pages)
    assert "曝光融合" in extracted and "审阅附录" in extracted
    print(f"LAB 003 article: PASS (9 sections, 10 images, {len(reader.pages)} PDF pages)")


if __name__ == "__main__":
    main()
