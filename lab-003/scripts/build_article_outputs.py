from __future__ import annotations

import html
import json
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
ARTICLE = ROOT / "article" / "article.md"
COPY_HTML_OUTPUT = ROOT / "web" / "article-copy.html"
PUBLIC_IMAGE_BASE = "https://hub-fover.github.io/Vision-Hu13/lab-003/assets/figures/"
HTML_OUTPUT = ROOT / "article" / "article_排版_石墨极简(graphite-minimal).html"
PDF_OUTPUT = ROOT / "output" / "pdf" / "lab-003-review.pdf"
TAGS = ["TRY", "DYNAMIC RANGE", "CAPTURE", "SCENE CHECK", "ALIGNMENT", "WEIGHTS", "PYRAMID", "MOTION", "BOUNDARIES"]
KEYWORDS = (
    "三张照片", "当前页面内存", "相对亮度", "直方图", "局部特征", "中间曝光",
    "重投影误差", "对比度", "饱和度", "适曝度", "融合权重", "多层表示",
    "运动区域", "曝光融合", "绝对辐亮度", "教学管线",
)


def parse_markdown(text: str):
    blocks = []
    paragraph = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            if paragraph:
                blocks.append(("paragraph", " ".join(paragraph)))
                paragraph = []
            continue
        image_match = re.fullmatch(r"!\[(.*?)]\((.*?)\)", line)
        if image_match:
            if paragraph:
                blocks.append(("paragraph", " ".join(paragraph)))
                paragraph = []
            blocks.append(("image", image_match.groups()))
        elif line.startswith("# "):
            blocks.append(("title", line[2:]))
        elif line.startswith("## "):
            if paragraph:
                blocks.append(("paragraph", " ".join(paragraph)))
                paragraph = []
            blocks.append(("section", line[3:]))
        elif line.startswith("> "):
            if paragraph:
                blocks.append(("paragraph", " ".join(paragraph)))
                paragraph = []
            blocks.append(("quote", line[2:]))
        else:
            paragraph.append(line)
    if paragraph:
        blocks.append(("paragraph", " ".join(paragraph)))
    return blocks


def inline(content: str) -> str:
    escaped = html.escape(content, quote=True)
    escaped = re.sub(r"`([^`]+)`", r'<span style="background:#F4F4F5;color:#27272A;padding:2px 6px;border-radius:4px;font-family:Consolas,monospace;font-size:14px;"><span leaf="">\1</span></span>', escaped)
    for keyword in KEYWORDS:
        escaped_keyword = html.escape(keyword)
        if escaped_keyword in escaped:
            escaped = escaped.replace(escaped_keyword, f'<span style="border-bottom:2px solid #52525B;font-weight:600;color:#27272A;"><span leaf="">{escaped_keyword}</span></span>', 1)
            break
    parts = re.split(r"(<span style=.*?</span></span>)", escaped)
    return "".join(part if part.startswith("<span style=") else (f'<span leaf="">{part}</span>' if part else "") for part in parts)


def section_header(number: int, title: str) -> str:
    return f'''<section style="margin-top:{16 if number == 1 else 56}px;margin-bottom:32px;padding:0 10px;">
  <section style="position:relative;padding-bottom:20px;border-bottom:1px solid #E4E4E7;">
    <p style="font-size:48px;font-weight:900;color:#E4E4E7;margin:0;line-height:1;letter-spacing:0;"><span leaf="">{number:02d}</span></p>
    <section style="margin-top:-8px;">
      <p style="font-size:10px;color:#A1A1AA;font-weight:500;letter-spacing:3px;margin:0 0 6px;text-transform:uppercase;"><span leaf="">{TAGS[number - 1]}</span></p>
      <h3 style="font-size:20px;font-weight:800;color:#27272A;margin:0;letter-spacing:0;line-height:1.4;"><span leaf="">{html.escape(title)}</span></h3>
    </section>
  </section>
</section>'''


def build_gzh(blocks, *, image_base: str | None = None, include_title: bool = False) -> str:
    output = ['<section style="max-width:677px;margin:0 auto;background:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Hiragino Sans GB\',\'Microsoft YaHei\',sans-serif;color:#52525B;line-height:1.8;letter-spacing:0;overflow-x:hidden;">']
    if include_title:
        title = next(value for kind, value in blocks if kind == "title")
        output.append(f'<section style="padding:24px 10px 8px;"><h1 style="font-size:28px;line-height:1.4;color:#27272A;margin:0;font-weight:800;">{html.escape(title)}</h1></section>')
    quote = next(value for kind, value in blocks if kind == "quote")
    output.append(f'''<section style="margin:10px 10px 40px;padding:32px 24px 24px;border-top:1px solid #E4E4E7;border-bottom:1px solid #E4E4E7;background:#FFFFFF;">
  <p style="font-size:11px;color:#A1A1AA;letter-spacing:2px;margin:0 0 18px;font-weight:400;"><span leaf="">QUOTE</span></p>
  <p style="font-size:18px;font-weight:700;color:#27272A;margin:0 0 8px;line-height:1.7;letter-spacing:0;">{inline(quote)}</p>
</section>''')
    section_number = 0
    skipped_quote = False
    for kind, value in blocks:
        if kind == "title":
            continue
        if kind == "quote" and not skipped_quote:
            skipped_quote = True
            continue
        if kind == "section":
            section_number += 1
            output.append(section_header(section_number, value))
        elif kind == "paragraph":
            output.append(f'<section style="padding:0 10px;"><p style="margin:0 0 22px;font-size:15px;line-height:1.8;text-align:justify;color:#52525B;letter-spacing:0;">{inline(value)}</p></section>')
        elif kind == "image":
            alt, source = value
            image_source = f"{image_base}{Path(source).name}" if image_base else source
            output.append(f'''<section style="border:1px solid #E4E4E7;padding:4px;margin:0 10px 8px;">
  <section style="margin:0;overflow:hidden;"><span leaf=""><img src="{html.escape(image_source, quote=True)}" style="max-width:100%;height:auto;display:block;margin:0 auto;"></span></section>
</section>
<p style="font-size:12px;color:#A1A1AA;text-align:center;margin:0 10px 28px;letter-spacing:0;"><span leaf="">— {html.escape(alt)}</span></p>''')
    output.append('''<section style="padding:0 10px;"><section style="text-align:center;margin:0 0 36px;"><section style="display:flex;align-items:center;justify-content:center;">
  <span style="height:1px;width:48px;background:#E4E4E7;margin-right:16px;"><span leaf=""><br></span></span>
  <span style="font-size:10px;color:#A1A1AA;letter-spacing:4px;font-weight:500;"><span leaf="">END</span></span>
  <span style="height:1px;width:48px;background:#E4E4E7;margin-left:16px;"><span leaf=""><br></span></span>
</section></section></section>
<section style="padding:0 10px 24px;"><section style="border-top:1px solid #E4E4E7;padding-top:28px;">
  <p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#52525B;text-align:justify;"><span leaf="">我是 {{作者名}}，{{一句话简介}}。</span></p>
  <p style="margin:0;font-size:15px;line-height:1.8;color:#52525B;text-align:justify;"><span leaf="">如果你觉得今天这篇有收获，欢迎</span><strong style="color:#27272A;"><span leaf="">点赞、在看、转发</span></strong><span leaf="">，我们下篇见。</span></p>
</section></section>''')
    output.append("</section>")
    return "\n".join(output) + "\n"


def plain_text(blocks) -> str:
    lines = []
    for kind, value in blocks:
        if kind in {"title", "section", "quote", "paragraph"}:
            lines.append(value)
        elif kind == "image":
            lines.append(value[0])
    return "\n\n".join(lines)


def build_copy_page(blocks) -> str:
    content = build_gzh(blocks, image_base=PUBLIC_IMAGE_BASE, include_title=True)
    text = json.dumps(plain_text(blocks), ensure_ascii=False)
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LAB 003｜公众号复制版</title>
<style>
body{{margin:0;background:#eef0f2;color:#27272A;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}}
.copy-toolbar{{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;background:#fff;border-bottom:1px solid #E4E4E7;}}
.copy-toolbar p{{margin:0;color:#71717A;font-size:13px;line-height:1.5;}}
.copy-button{{border:0;border-radius:6px;padding:10px 16px;background:#059669;color:#fff;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;}}
.copy-button:focus-visible{{outline:3px solid #A7F3D0;outline-offset:2px;}}
.copy-status{{min-height:22px;margin:10px auto 0;max-width:677px;padding:0 10px;color:#047857;font-size:13px;}}
@media(max-width:520px){{.copy-toolbar p{{font-size:12px;}}.copy-button{{padding:9px 12px;}}}}
</style>
</head>
<body>
<header class="copy-toolbar">
  <p>复制下方正文，直接粘贴到公众号图文编辑器。</p>
  <button class="copy-button" id="copy-button" type="button">复制到公众号</button>
</header>
<p class="copy-status" id="copy-status" role="status" aria-live="polite"></p>
<main id="copy-content">{content}</main>
<script>
(() => {{
  const button = document.getElementById("copy-button");
  const status = document.getElementById("copy-status");
  const content = document.getElementById("copy-content");
  const plain = {text};
  const html = content.innerHTML;
  const announce = (message, failed = false) => {{
    status.textContent = message;
    status.style.color = failed ? "#B91C1C" : "#047857";
  }};
  const fallback = () => {{
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    let copied = false;
    try {{ copied = document.execCommand("copy"); }} catch {{ copied = false; }}
    if (copied) {{
      selection.removeAllRanges();
      announce("已复制，可直接粘贴到公众号编辑器。");
    }} else {{
      announce("已选中全文，请按 Ctrl/Cmd+C 后粘贴。", true);
    }}
  }};
  button.addEventListener("click", async () => {{
    try {{
      if (navigator.clipboard?.write && window.ClipboardItem) {{
        const item = new ClipboardItem({{
          "text/html": new Blob([html], {{ type: "text/html" }}),
          "text/plain": new Blob([plain], {{ type: "text/plain" }}),
        }});
        await navigator.clipboard.write([item]);
        announce("已复制，可直接粘贴到公众号编辑器。");
        return;
      }}
    }} catch {{}}
    fallback();
  }});
}})();
</script>
</body>
</html>
'''


def pdf_styles():
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("ChineseTitle", parent=base["Title"], fontName="STSong-Light", fontSize=25, leading=34, textColor=colors.HexColor("#171816"), alignment=TA_LEFT, spaceAfter=12),
        "subtitle": ParagraphStyle("Subtitle", parent=base["Normal"], fontName="STSong-Light", fontSize=11, leading=18, textColor=colors.HexColor("#686A65"), spaceAfter=22),
        "section": ParagraphStyle("Section", parent=base["Heading2"], fontName="STSong-Light", fontSize=17, leading=24, textColor=colors.HexColor("#27272A"), spaceBefore=18, spaceAfter=12),
        "body": ParagraphStyle("Body", parent=base["BodyText"], fontName="STSong-Light", fontSize=10.5, leading=18, alignment=TA_JUSTIFY, textColor=colors.HexColor("#3F3F46"), spaceAfter=10),
        "caption": ParagraphStyle("Caption", parent=base["Normal"], fontName="STSong-Light", fontSize=8.5, leading=13, alignment=TA_CENTER, textColor=colors.HexColor("#71717A"), spaceAfter=14),
        "quote": ParagraphStyle("Quote", parent=base["Normal"], fontName="STSong-Light", fontSize=13, leading=22, alignment=TA_CENTER, textColor=colors.HexColor("#27272A"), borderColor=colors.HexColor("#E4E4E7"), borderWidth=1, borderPadding=14, spaceAfter=18),
    }


def page(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#E4E4E7"))
    canvas.line(20 * mm, 18 * mm, 190 * mm, 18 * mm)
    canvas.setFont("STSong-Light", 8)
    canvas.setFillColor(colors.HexColor("#71717A"))
    canvas.drawString(20 * mm, 12 * mm, "VISION · HU13 / LAB 003 REVIEW")
    canvas.drawRightString(190 * mm, 12 * mm, str(document.page))
    canvas.restoreState()


def build_pdf(blocks) -> None:
    PDF_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = pdf_styles()
    document = SimpleDocTemplate(str(PDF_OUTPUT), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=24 * mm, title="LAB 003 Review")
    story = []
    title = next(value for kind, value in blocks if kind == "title")
    story.append(Paragraph(html.escape(title), styles["title"]))
    story.append(Paragraph("不用专业模式：手机拍暗、正常、亮三张，网页本地合成曝光融合", styles["subtitle"]))
    for kind, value in blocks:
        if kind == "title":
            continue
        if kind == "quote":
            story.append(Paragraph(html.escape(value), styles["quote"]))
        elif kind == "section":
            story.append(Paragraph(html.escape(value), styles["section"]))
        elif kind == "paragraph":
            if value.startswith("副标题："):
                continue
            story.append(Paragraph(html.escape(value), styles["body"]))
        elif kind == "image":
            alt, source = value
            image_path = (ARTICLE.parent / source).resolve()
            story.append(Spacer(1, 3 * mm))
            image = Image(str(image_path))
            image._restrictSize(168 * mm, 95 * mm)
            story.append(image)
            story.append(Paragraph(f"图：{html.escape(alt)}", styles["caption"]))
    story.append(PageBreak())
    story.append(Paragraph("审阅附录", styles["section"]))
    story.append(Paragraph("算法边界：三帧普通图像、相似变换对齐、Mertens 多尺度融合、基础运动保护；不恢复绝对 HDR 辐亮度，不复刻厂商内部管线。", styles["body"]))
    story.append(Paragraph("素材：Peyrou 曝光序列，固定提交 ad19046ddfd266b431a45276c366fe03e107e3cd，MIT License。", styles["body"]))
    story.append(Paragraph("生成日期：2026-07-31", styles["body"]))
    document.build(story, onFirstPage=page, onLaterPages=page)


def main() -> None:
    blocks = parse_markdown(ARTICLE.read_text(encoding="utf-8"))
    HTML_OUTPUT.write_text(build_gzh(blocks), encoding="utf-8")
    COPY_HTML_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    COPY_HTML_OUTPUT.write_text(build_copy_page(blocks), encoding="utf-8")
    build_pdf(blocks)


if __name__ == "__main__":
    main()
