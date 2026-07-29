"""Generate ten editable SVG diagrams and matching Pillow-rendered PNGs."""

from __future__ import annotations

import html
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "figures"
W, H = 1080, 675
BG = "#08111f"
PANEL = "#10213a"
WHITE = "#f4f8ff"
MUTED = "#8ea6c3"
BLUE = "#126aff"
GREEN = "#2dd399"
ORANGE = "#ff9f43"

FIGURES = (
    ("01-before-after", "贴前 / 贴后", "同一素材，精准进入目标平面", "before"),
    ("02-vanishing-points", "消失点", "平行线汇聚，透视方向可读", "vanish"),
    ("03-homography", "单应变换", "四点定义平面映射", "homography"),
    ("04-pipeline", "处理管线", "选择 → 变换 → 混合 → 导出", "pipeline"),
    ("05-control-points", "控制点", "拖动四角，实时约束边界", "controls"),
    ("06-blend-modes", "混合模式", "正片叠底 / 滤色 / 叠加", "blend"),
    ("07-texture", "纹理保留", "让墙面细节穿过贴图", "texture"),
    ("08-boundaries", "边界处理", "羽化与遮罩消除硬边", "boundaries"),
    ("09-shortcuts", "快捷键", "高频操作保持在指尖", "shortcuts"),
    ("10-dual-runtime", "双端运行", "浏览器与 Python 共用几何契约", "runtime"),
)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    paths = (
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    )
    for path in paths:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def svg_for(index: int, title: str, subtitle: str, motif: str) -> str:
    title_e, subtitle_e = html.escape(title), html.escape(subtitle)
    body = svg_motif(motif)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="675" viewBox="0 0 1080 675">
  <title>Vision Hu13 · {title_e}</title>
  <rect width="1080" height="675" fill="{BG}"/>
  <path d="M0 90H1080M80 0V675M1000 0V675" stroke="#18314f" stroke-width="1"/>
  <text x="80" y="67" fill="{BLUE}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="20" font-weight="700" letter-spacing="2">VISION HU13 · LAB 001</text>
  <text x="80" y="142" fill="{WHITE}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="48" font-weight="700">{title_e}</text>
  <text x="80" y="181" fill="{MUTED}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="21">{subtitle_e}</text>
  <g id="{motif}">{body}</g>
  <text x="80" y="628" fill="{MUTED}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="17">0{index} / 10 · PERSPECTIVE PASTE</text>
</svg>
"""


def svg_motif(motif: str) -> str:
    if motif == "before":
        return f"""<rect x="80" y="225" width="410" height="320" rx="20" fill="{PANEL}"/><rect x="590" y="225" width="410" height="320" rx="20" fill="{PANEL}"/>
<rect x="135" y="285" width="300" height="190" rx="10" fill="#263a55"/><path d="M655 300L940 260 910 490 680 515Z" fill="{BLUE}" opacity=".85"/>
<path d="M515 385H565" stroke="{GREEN}" stroke-width="8"/><path d="M550 368L570 385 550 402" fill="none" stroke="{GREEN}" stroke-width="8"/>"""
    if motif == "vanish":
        return f"""<rect x="80" y="225" width="920" height="320" rx="20" fill="{PANEL}"/><circle cx="830" cy="345" r="12" fill="{ORANGE}"/>
<path d="M120 510L830 345M350 510L830 345M610 510L830 345M980 510L830 345" stroke="{BLUE}" stroke-width="4"/>
<text x="850" y="340" fill="{ORANGE}" font-family="Arial,Microsoft YaHei" font-size="20">消失点</text>"""
    if motif in {"homography", "controls"}:
        return f"""<path d="M190 280L485 250 450 500 145 525Z" fill="{PANEL}" stroke="{BLUE}" stroke-width="5"/>
<path d="M650 250L940 310 900 510 620 460Z" fill="{BLUE}" opacity=".28" stroke="{GREEN}" stroke-width="5"/>
<path d="M485 375H610" stroke="{ORANGE}" stroke-width="7" stroke-dasharray="14 10"/>
<g fill="{WHITE}" stroke="{BLUE}" stroke-width="5"><circle cx="190" cy="280" r="12"/><circle cx="485" cy="250" r="12"/><circle cx="450" cy="500" r="12"/><circle cx="145" cy="525" r="12"/></g>"""
    if motif == "pipeline":
        labels = ("选择", "变换", "混合", "导出")
        return "".join(
            f'<rect x="{90+i*240}" y="300" width="180" height="120" rx="20" fill="{PANEL}" stroke="{(BLUE,GREEN,ORANGE,BLUE)[i]}" stroke-width="4"/>'
            f'<text x="{180+i*240}" y="370" text-anchor="middle" fill="{WHITE}" font-family="Arial,Microsoft YaHei" font-size="26">{label}</text>'
            + (f'<path d="M{275+i*240} 360H{320+i*240}" stroke="{MUTED}" stroke-width="5"/>' if i < 3 else "")
            for i, label in enumerate(labels)
        )
    if motif == "blend":
        return f"""<circle cx="380" cy="385" r="145" fill="{BLUE}" opacity=".70"/><circle cx="550" cy="385" r="145" fill="{GREEN}" opacity=".64"/>
<circle cx="720" cy="385" r="145" fill="{ORANGE}" opacity=".62"/><text x="540" y="565" text-anchor="middle" fill="{WHITE}" font-family="Arial,Microsoft YaHei" font-size="22">光线 × 材质 × 颜色</text>"""
    if motif == "texture":
        lines = "".join(f'<path d="M130 {280+i*32}Q350 {245+i*38} 540 {280+i*29}T950 {270+i*34}" fill="none" stroke="{MUTED}" opacity=".45" stroke-width="3"/>' for i in range(8))
        return f'<rect x="80" y="225" width="920" height="320" rx="20" fill="{PANEL}"/>{lines}<path d="M330 280L800 250 760 500 300 520Z" fill="{BLUE}" opacity=".30" stroke="{GREEN}" stroke-width="4"/>'
    if motif == "boundaries":
        return f"""<defs><linearGradient id="fade"><stop offset="0" stop-color="{BLUE}" stop-opacity="0"/><stop offset=".2" stop-color="{BLUE}"/><stop offset=".8" stop-color="{BLUE}"/><stop offset="1" stop-color="{BLUE}" stop-opacity="0"/></linearGradient></defs>
<rect x="170" y="260" width="740" height="240" rx="38" fill="url(#fade)"/><path d="M180 525H900" stroke="{GREEN}" stroke-width="5" stroke-dasharray="10 14"/>
<text x="540" y="390" text-anchor="middle" fill="{WHITE}" font-family="Arial,Microsoft YaHei" font-size="30">羽化边界</text>"""
    if motif == "shortcuts":
        keys = (("1", "选择"), ("2", "定位"), ("3", "混合"), ("↵", "应用"))
        return "".join(
            f'<rect x="{100+i*240}" y="285" width="180" height="160" rx="22" fill="{PANEL}" stroke="{(BLUE,GREEN,ORANGE,BLUE)[i]}" stroke-width="4"/>'
            f'<text x="{190+i*240}" y="350" text-anchor="middle" fill="{WHITE}" font-family="Arial" font-size="38" font-weight="700">{key}</text>'
            f'<text x="{190+i*240}" y="410" text-anchor="middle" fill="{MUTED}" font-family="Arial,Microsoft YaHei" font-size="21">{label}</text>'
            for i, (key, label) in enumerate(keys)
        )
    if motif == "runtime":
        return f"""<rect x="100" y="265" width="330" height="225" rx="24" fill="{PANEL}" stroke="{BLUE}" stroke-width="4"/>
<rect x="650" y="265" width="330" height="225" rx="24" fill="{PANEL}" stroke="{GREEN}" stroke-width="4"/>
<text x="265" y="365" text-anchor="middle" fill="{WHITE}" font-family="Arial" font-size="30">BROWSER</text><text x="815" y="365" text-anchor="middle" fill="{WHITE}" font-family="Arial" font-size="30">PYTHON</text>
<path d="M430 377H650" stroke="{ORANGE}" stroke-width="8"/><circle cx="540" cy="377" r="34" fill="{ORANGE}"/><text x="540" y="385" text-anchor="middle" fill="{BG}" font-family="Arial" font-size="19" font-weight="700">JSON</text>"""
    return ""


def draw_png(index: int, title: str, subtitle: str, motif: str) -> Image.Image:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.line((0, 90, W, 90), fill="#18314f", width=1)
    draw.line((80, 0, 80, H), fill="#18314f", width=1)
    draw.line((1000, 0, 1000, H), fill="#18314f", width=1)
    draw.text((80, 42), "VISION HU13 · LAB 001", font=font(20, True), fill=BLUE)
    draw.text((80, 105), title, font=font(48, True), fill=WHITE)
    draw.text((80, 160), subtitle, font=font(21), fill=MUTED)
    draw_motif(draw, motif)
    draw.text((80, 604), f"0{index} / 10 · PERSPECTIVE PASTE", font=font(17), fill=MUTED)
    return image


def draw_motif(draw: ImageDraw.ImageDraw, motif: str) -> None:
    if motif == "before":
        for box in ((80, 225, 490, 545), (590, 225, 1000, 545)):
            draw.rounded_rectangle(box, 20, fill=PANEL)
        draw.rounded_rectangle((135, 285, 435, 475), 10, fill="#263a55")
        draw.polygon([(655, 300), (940, 260), (910, 490), (680, 515)], fill=BLUE)
        draw.line((515, 385, 565, 385), fill=GREEN, width=8)
    elif motif == "vanish":
        draw.rounded_rectangle((80, 225, 1000, 545), 20, fill=PANEL)
        for point in ((120, 510), (350, 510), (610, 510), (980, 510)):
            draw.line((point, (830, 345)), fill=BLUE, width=4)
        draw.ellipse((818, 333, 842, 357), fill=ORANGE)
        draw.text((850, 320), "消失点", font=font(20), fill=ORANGE)
    elif motif in {"homography", "controls"}:
        draw.polygon([(190, 280), (485, 250), (450, 500), (145, 525)], fill=PANEL, outline=BLUE, width=5)
        draw.polygon([(650, 250), (940, 310), (900, 510), (620, 460)], fill="#173e59", outline=GREEN)
        draw.line((485, 375, 610, 375), fill=ORANGE, width=7)
        for x, y in ((190, 280), (485, 250), (450, 500), (145, 525)):
            draw.ellipse((x - 12, y - 12, x + 12, y + 12), fill=WHITE, outline=BLUE, width=5)
    elif motif == "pipeline":
        for i, label in enumerate(("选择", "变换", "混合", "导出")):
            x = 90 + i * 240
            color = (BLUE, GREEN, ORANGE, BLUE)[i]
            draw.rounded_rectangle((x, 300, x + 180, 420), 20, fill=PANEL, outline=color, width=4)
            box = draw.textbbox((0, 0), label, font=font(26))
            draw.text((x + 90 - (box[2] - box[0]) / 2, 340), label, font=font(26), fill=WHITE)
            if i < 3:
                draw.line((x + 185, 360, x + 230, 360), fill=MUTED, width=5)
    elif motif == "blend":
        draw.ellipse((235, 240, 525, 530), fill=(18, 106, 255, 180))
        draw.ellipse((405, 240, 695, 530), fill=(45, 211, 153, 165))
        draw.ellipse((575, 240, 865, 530), fill=(255, 159, 67, 160))
        draw.text((420, 535), "光线 × 材质 × 颜色", font=font(22), fill=WHITE)
    elif motif == "texture":
        draw.rounded_rectangle((80, 225, 1000, 545), 20, fill=PANEL)
        for i in range(8):
            y = 280 + i * 32
            draw.line((130, y, 950, y - 8 + (i % 3) * 9), fill=(142, 166, 195, 110), width=3)
        draw.polygon([(330, 280), (800, 250), (760, 500), (300, 520)], fill=(18, 106, 255, 80), outline=GREEN)
    elif motif == "boundaries":
        for i in range(70):
            alpha = int(255 * min(i / 14, (69 - i) / 14, 1))
            x = 170 + i * 10
            draw.rectangle((x, 260, x + 11, 500), fill=(18, 106, 255, alpha))
        draw.line((180, 525, 900, 525), fill=GREEN, width=5)
        draw.text((455, 355), "羽化边界", font=font(30), fill=WHITE)
    elif motif == "shortcuts":
        for i, (key, label) in enumerate((("1", "选择"), ("2", "定位"), ("3", "混合"), ("↵", "应用"))):
            x = 100 + i * 240
            color = (BLUE, GREEN, ORANGE, BLUE)[i]
            draw.rounded_rectangle((x, 285, x + 180, 445), 22, fill=PANEL, outline=color, width=4)
            draw.text((x + 74, 310), key, font=font(38, True), fill=WHITE)
            draw.text((x + 62, 382), label, font=font(21), fill=MUTED)
    elif motif == "runtime":
        for x, color, label in ((100, BLUE, "BROWSER"), (650, GREEN, "PYTHON")):
            draw.rounded_rectangle((x, 265, x + 330, 490), 24, fill=PANEL, outline=color, width=4)
            draw.text((x + 82, 340), label, font=font(30), fill=WHITE)
        draw.line((430, 377, 650, 377), fill=ORANGE, width=8)
        draw.ellipse((506, 343, 574, 411), fill=ORANGE)
        draw.text((516, 363), "JSON", font=font(17, True), fill=BG)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for index, (stem, title, subtitle, motif) in enumerate(FIGURES, 1):
        (OUTPUT / f"{stem}.svg").write_text(svg_for(index, title, subtitle, motif), encoding="utf-8")
        draw_png(index, title, subtitle, motif).save(OUTPUT / f"{stem}.png", optimize=True)
    print(f"Generated {len(FIGURES)} SVG/PNG figure pairs in {OUTPUT}")


if __name__ == "__main__":
    main()
