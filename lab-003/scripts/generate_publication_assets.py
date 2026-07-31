from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from exposure_fusion.alignment import align_exposures
from exposure_fusion.analysis import analyze_exposures
from exposure_fusion.contracts import FusionOptions
from exposure_fusion.crop import crop_common_region
from exposure_fusion.motion import detect_motion
from exposure_fusion.weights import compute_quality_weights


ROOT = Path(__file__).resolve().parents[1]
FIGURES = ROOT / "assets" / "figures"
PUBLIC = ROOT / "assets" / "public"
SAMPLES = ROOT / "assets" / "sources" / "peyrou"
ARTIFACTS = ROOT / "artifacts"
FONT_PATH = Path(r"C:\Windows\Fonts\msyh.ttc")


def font(size: int, bold: bool = False):
    path = Path(r"C:\Windows\Fonts\msyhbd.ttc") if bold else FONT_PATH
    return ImageFont.truetype(str(path), size)


def rgb(array: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(array, cv2.COLOR_BGR2RGB)


def pil(array: np.ndarray) -> Image.Image:
    return Image.fromarray(rgb(array))


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, "#171816")
    canvas.paste(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return canvas


def heading(canvas: Image.Image, title: str, subtitle: str = "") -> None:
    draw = ImageDraw.Draw(canvas)
    draw.text((38, 22), title, fill="#171816", font=font(28, True))
    if subtitle:
        draw.text((40, 61), subtitle, fill="#686a65", font=font(15))


def label(image: Image.Image, text: str, xy=(16, 14)) -> None:
    draw = ImageDraw.Draw(image)
    box = draw.textbbox(xy, text, font=font(16, True))
    draw.rectangle((box[0] - 7, box[1] - 5, box[2] + 7, box[3] + 5), fill="#f4f4f1")
    draw.text(xy, text, fill="#171816", font=font(16, True))


def save(image: Image.Image, name: str, quality=94) -> None:
    path = FIGURES / name
    image.convert("RGB").save(path, quality=quality, subsampling=0)


def feature_figure(dark: np.ndarray, normal: np.ndarray) -> Image.Image:
    def features(image):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        orb = cv2.ORB_create(2000)
        return orb.detectAndCompute(gray, None)

    kp1, des1 = features(dark)
    kp2, des2 = features(normal)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    forward = matcher.knnMatch(des1, des2, k=2)
    reverse = matcher.knnMatch(des2, des1, k=2)
    accepted = {pair[0].queryIdx: pair[0].trainIdx for pair in forward if len(pair) == 2 and pair[0].distance < .75 * pair[1].distance}
    reversed_pairs = {pair[0].queryIdx: pair[0].trainIdx for pair in reverse if len(pair) == 2 and pair[0].distance < .75 * pair[1].distance}
    matches = [cv2.DMatch(index, target, 0) for index, target in accepted.items() if reversed_pairs.get(target) == index]
    matches = sorted(matches, key=lambda match: match.distance)[:60]
    drawn = cv2.drawMatches(dark, kp1, normal, kp2, matches, None, flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
    output = Image.new("RGB", (1200, 700), "#f4f4f1")
    heading(output, "同一场景留下相互一致的特征", f"Lowe ratio 0.75 · mutual matches shown: {len(matches)}")
    output.paste(fit(pil(drawn), (1120, 570)), (40, 100))
    return output


def main() -> None:
    FIGURES.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    paths = [SAMPLES / "under.jpg", SAMPLES / "mean.jpg", SAMPLES / "over.jpg"]
    originals = [cv2.imread(str(path), cv2.IMREAD_COLOR) for path in paths]
    exposure = analyze_exposures(originals)
    ordered = [originals[index] for index in exposure.ordered_indices]
    options = FusionOptions()
    aligned = align_exposures(ordered, options)
    crop = crop_common_region(aligned.masks)
    cropped = [crop.apply(image) for image in aligned.images]
    weights, components = compute_quality_weights(cropped, options)
    motion = detect_motion(cropped)
    fused = cv2.imread(str(ARTIFACTS / "peyrou-fusion.jpg"), cv2.IMREAD_COLOR)

    comparison = Image.new("RGB", (1200, 720), "#f4f4f1")
    heading(comparison, "三张曝光，各自保留不同区域", "偏暗保高光 · 偏亮保阴影 · 融合选择更可靠部分")
    titles = ["偏暗", "正常", "偏亮", "融合结果"]
    for index, image in enumerate([*ordered, fused]):
        panel = fit(pil(image), (276, 540))
        label(panel, titles[index])
        comparison.paste(panel, (36 + index * 288, 108))
    save(comparison, "01-exposure-comparison.jpg")
    comparison.save(PUBLIC / "static-comparison.jpg", quality=94, subsampling=0)

    histogram = Image.new("RGB", (1200, 700), "#f4f4f1")
    heading(histogram, "曝光改变亮度分布", "同一场景的灰度直方图，已归一化显示")
    draw = ImageDraw.Draw(histogram)
    chart = (82, 120, 1140, 620)
    draw.rectangle(chart, outline="#c9cbc5", width=2)
    colors = ["#2b6cb0", "#176b4d", "#c83b31"]
    for image, color, title in zip(ordered, colors, titles[:3]):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        values = cv2.calcHist([gray], [0], None, [256], [0, 256]).ravel()
        values = np.log1p(values)
        values /= values.max()
        points = [(chart[0] + index * (chart[2] - chart[0]) / 255, chart[3] - value * (chart[3] - chart[1] - 20)) for index, value in enumerate(values)]
        draw.line(points, fill=color, width=4)
        x = 850 + titles.index(title) * 95
        draw.rectangle((x, 78, x + 22, 86), fill=color)
        draw.text((x + 28, 66), title, fill="#171816", font=font(14))
    save(histogram, "02-histogram.jpg")

    metrics = Image.new("RGB", (1200, 700), "#f4f4f1")
    heading(metrics, "程序先自动排序，再看裁切风险", "相对亮度不是精确 EV，只用于暗 / 中 / 亮排序")
    draw = ImageDraw.Draw(metrics)
    scores = np.array(exposure.luminance_scores)[list(exposure.ordered_indices)]
    normalized = (scores - scores.min()) / max(1e-6, scores.max() - scores.min())
    for index, (title, score, value) in enumerate(zip(titles, scores, normalized)):
        if index == 3:
            break
        y = 150 + index * 140
        draw.text((90, y), title, fill="#171816", font=font(22, True))
        draw.rectangle((250, y + 6, 1050, y + 46), fill="#e4e4e7")
        draw.rectangle((250, y + 6, 250 + int(800 * (.12 + value * .88)), y + 46), fill=colors[index])
        draw.text((250, y + 62), f"relative luminance score {score:.2f}", fill="#686a65", font=font(15))
    save(metrics, "03-exposure-metrics.jpg")

    save(feature_figure(ordered[0], ordered[1]), "04-feature-matches.jpg")

    before = cv2.absdiff(cv2.cvtColor(ordered[0], cv2.COLOR_BGR2GRAY), cv2.cvtColor(ordered[1], cv2.COLOR_BGR2GRAY))
    before = crop.apply(before)
    after = cv2.absdiff(cv2.cvtColor(cropped[0], cv2.COLOR_BGR2GRAY), cv2.cvtColor(cropped[1], cv2.COLOR_BGR2GRAY))
    align_canvas = Image.new("RGB", (1200, 700), "#f4f4f1")
    heading(align_canvas, "对齐让固定边缘重新重合", "为便于观察，差异图先做直方图均衡；曝光差异仍会留下亮度残差")
    for index, (array, title) in enumerate([(before, "对齐前"), (after, "对齐后")]):
        panel = fit(Image.fromarray(cv2.equalizeHist(array)).convert("RGB"), (540, 520))
        label(panel, title)
        align_canvas.paste(panel, (40 + index * 580, 120))
    save(align_canvas, "05-alignment.jpg")

    component_canvas = Image.new("RGB", (1200, 700), "#f4f4f1")
    heading(component_canvas, "三类质量分数回答三个问题", "哪里有细节？哪里有颜色？哪里没有过暗或过亮？")
    names = ["对比度", "饱和度", "适曝度"]
    arrays = list(components[1])
    for index, (name, array) in enumerate(zip(names, arrays)):
        normalized_array = cv2.normalize(array, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        colored = cv2.applyColorMap(normalized_array, cv2.COLORMAP_VIRIDIS)
        panel = fit(pil(colored), (360, 520))
        label(panel, name)
        component_canvas.paste(panel, (30 + index * 390, 120))
    save(component_canvas, "06-three-weights.jpg")

    weight_canvas = Image.new("RGB", (1200, 700), "#f4f4f1")
    heading(weight_canvas, "同一位置的三张权重加起来等于 1", "亮区、暗区和细节区会偏向不同曝光")
    for index, (title, array) in enumerate(zip(titles, weights)):
        if index == 3:
            break
        colored = cv2.applyColorMap(np.clip(array * 255, 0, 255).astype(np.uint8), cv2.COLORMAP_VIRIDIS)
        panel = fit(pil(colored), (360, 520))
        label(panel, title)
        weight_canvas.paste(panel, (30 + index * 390, 120))
    save(weight_canvas, "07-normalized-weights.jpg")

    pyramid_canvas = Image.new("RGB", (1200, 700), "#f4f4f1")
    heading(pyramid_canvas, "五层金字塔把细节和大范围亮度分开处理", "上：Gaussian 图像层；下：对应 Laplacian 细节层")
    current = cropped[1]
    gaussian = [current]
    for _ in range(4):
        gaussian.append(cv2.pyrDown(gaussian[-1]))
    for index, level in enumerate(gaussian):
        x = 30 + index * 232
        top = fit(pil(level), (210, 230))
        label(top, f"L{index}", (10, 10))
        pyramid_canvas.paste(top, (x, 120))
        if index < 4:
            expanded = cv2.pyrUp(gaussian[index + 1], dstsize=(level.shape[1], level.shape[0]))
            laplacian = cv2.normalize(cv2.absdiff(level, expanded), None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        else:
            laplacian = level
        pyramid_canvas.paste(fit(pil(laplacian), (210, 230)), (x, 390))
    save(pyramid_canvas, "08-pyramid.jpg")

    motion_canvas = Image.new("RGB", (1200, 700), "#f4f4f1")
    heading(motion_canvas, "运动区域优先保留中间曝光", "白色是检测到变化的区域；它减少重影，但不是完整去鬼影")
    overlay = cropped[1].copy()
    overlay[motion > 0] = overlay[motion > 0] * .45 + np.array([54, 67, 255]) * .55
    motion_rgb = cv2.cvtColor(motion, cv2.COLOR_GRAY2BGR)
    for index, (array, title) in enumerate([(cropped[1], "中间曝光"), (motion_rgb, "运动遮罩"), (overlay.astype(np.uint8), "保护结果")]):
        panel = fit(pil(array), (360, 520))
        label(panel, title)
        motion_canvas.paste(panel, (30 + index * 390, 120))
    save(motion_canvas, "09-motion-mask.jpg")

    boundaries = Image.new("RGB", (1200, 700), "#f4f4f1")
    heading(boundaries, "LAB 003 的能力边界", "知道它做什么，也要知道它没有做什么")
    draw = ImageDraw.Draw(boundaries)
    columns = [
        ("它做了", ["三张普通 JPEG", "相对曝光排序", "轻微手抖对齐", "多尺度曝光融合", "基础运动保护"], "#176b4d"),
        ("它没有做", ["绝对辐亮度恢复", "RAW / DNG 管线", "完整去鬼影", "生成式内容修复", "复刻厂商 HDR"], "#c83b31"),
    ]
    for index, (title, items, color) in enumerate(columns):
        x = 80 + index * 560
        draw.line((x, 130, x + 480, 130), fill=color, width=5)
        draw.text((x, 155), title, fill="#171816", font=font(28, True))
        for row, item in enumerate(items):
            y = 235 + row * 72
            draw.ellipse((x, y + 8, x + 12, y + 20), fill=color)
            draw.text((x + 28, y), item, fill="#3f3f46", font=font(20))
    save(boundaries, "10-boundaries.jpg")

    cover_source = fit(pil(fused), (900, 383))
    overlay = Image.new("RGBA", cover_source.size, (0, 0, 0, 0))
    ImageDraw.Draw(overlay).rectangle((0, 0, 900, 383), fill=(10, 12, 10, 112))
    cover = Image.alpha_composite(cover_source.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(cover)
    draw.text((44, 42), "LAB 003", fill="#ffffff", font=font(24, True))
    draw.text((44, 100), "一张照片装不下的明暗", fill="#ffffff", font=font(46, True))
    draw.text((44, 172), "怎样用三次曝光合成？", fill="#ffffff", font=font(46, True))
    draw.text((46, 302), "手机原生相机 · 三张 JPEG · 浏览器本地融合", fill="#ffffff", font=font(18))
    cover.convert("RGB").save(PUBLIC / "cover.jpg", quality=94, subsampling=0)

    share = fit(pil(fused), (500, 400)).convert("RGBA")
    shade = Image.new("RGBA", share.size, (0, 0, 0, 0))
    ImageDraw.Draw(shade).rectangle((0, 250, 500, 400), fill=(15, 16, 14, 210))
    share = Image.alpha_composite(share, shade)
    draw = ImageDraw.Draw(share)
    draw.text((28, 272), "LAB 003 · 三次曝光合成", fill="white", font=font(26, True))
    draw.text((28, 324), "暗 / 正常 / 亮 → 一张融合 JPEG", fill="white", font=font(17))
    share.convert("RGB").save(PUBLIC / "share.jpg", quality=94, subsampling=0)

    report = {
        "figures": [path.name for path in sorted(FIGURES.glob("*.jpg"))],
        "source": "Peyrou pinned exposure sequence and LAB 003 diagnostics",
        "crop": {"x": crop.x, "y": crop.y, "width": crop.width, "height": crop.height},
        "motionFraction": float(np.mean(motion > 0)),
    }
    (PUBLIC / "generation-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    contact = Image.new("RGB", (1200, 5 * 360), "#d9dad6")
    for index, path in enumerate(sorted(FIGURES.glob("*.jpg"))):
        preview = fit(Image.open(path).convert("RGB"), (580, 340))
        contact.paste(preview, (10 + index % 2 * 600, 10 + index // 2 * 360))
    contact.save(ARTIFACTS / "figures-contact-sheet.jpg", quality=90)


if __name__ == "__main__":
    main()
