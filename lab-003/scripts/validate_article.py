from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FIGURE_BASE = "https://hub-fover.github.io/Vision-Hu13/lab-003/assets/figures/"
PUBLIC_QR_URL = "https://hub-fover.github.io/Vision-Hu13/lab-003/assets/public/lab-003-qr.png"


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
    images = re.findall(r"!\[[^]]*]\(([^)]+)\)", markdown)
    assert len(images) == 11
    assert len([path for path in images if "assets/figures" in path]) == 10
    assert images.count("../assets/public/lab-003-qr.png") == 1
    assert (ROOT / "assets" / "public" / "lab-003-qr.png").is_file()
    for phrase in (
        "窗边人物", "日落建筑", "夜景建筑或灯牌", "室内灯光下的静物",
        "手机原生相机", "系统亮度滑杆", "焦段和变焦不变",
        "公众号里的外部链接可能失效", "LAB 系列承诺", "我是 Vision Hu13",
    ):
        assert phrase in markdown, phrase
    assert "{{作者名}}" not in markdown and "{{一句话简介}}" not in markdown
    clean = next((ROOT / "article").glob("*_排版_石墨极简(graphite-minimal).html"))
    preview = next((ROOT / "article").glob("*_排版_石墨极简(graphite-minimal)_预览.html"))
    parser = GzhParser()
    parser.feed(clean.read_text(encoding="utf-8"))
    assert not parser.errors, parser.errors
    assert len(parser.images) == 11
    for source in parser.images:
        assert (clean.parent / source).resolve().is_file(), source
    copy_page = ROOT / "web" / "article-copy.html"
    assert copy_page.is_file()
    copy_html = copy_page.read_text(encoding="utf-8")
    assert 'id="copy-button"' in copy_html
    assert "navigator.clipboard" in copy_html and 'execCommand("copy")' in copy_html
    assert copy_html.count(PUBLIC_FIGURE_BASE) == 10
    assert copy_html.count(PUBLIC_QR_URL) == 1
    assert "LAB 系列承诺" in copy_html
    assert "{{作者名}}" not in copy_html and "{{一句话简介}}" not in copy_html
    copied_content = copy_html.split('<main id="copy-content">', 1)[1].split("</main>", 1)[0]
    assert "copy-button" not in copied_content and "copy-toolbar" not in copied_content
    assert "href=" not in copied_content
    assert "复制到公众号" in preview.read_text(encoding="utf-8")
    pdf = ROOT / "output" / "pdf" / "lab-003-review.pdf"
    reader = PdfReader(str(pdf))
    assert len(reader.pages) >= 8
    extracted = "".join(page.extract_text() or "" for page in reader.pages)
    assert "曝光融合" in extracted and "审阅附录" in extracted
    print(f"LAB 003 article: PASS (9 sections, 10 figures + 1 QR, {len(reader.pages)} PDF pages)")


if __name__ == "__main__":
    main()
