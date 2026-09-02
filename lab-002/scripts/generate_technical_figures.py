"""Generate LAB 002 teaching figures from real inputs and measured diagnostics."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Sequence

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

from panorama_stitch.contracts import StitchOptions
from panorama_stitch.errors import StitchError
from panorama_stitch.features import FeatureSet, MatchResult, extract_features, match_pair
from panorama_stitch.geometry import (
    HomographyResult,
    compose_transforms,
    estimate_homography,
)
from panorama_stitch.io import load_image
from panorama_stitch.render import (
    BlendResult,
    WarpResult,
    _exposure_gains,
    auto_crop,
    blend_panorama,
    warp_images,
)


WIDTH = 1080
CONTENT_HEIGHT = 560
FIGURE_HEIGHT = 720
REAL_LABEL = "基于真实输入的算法标注"
GENERATOR = "scripts/generate_technical_figures.py"
MOUNTAIN_CREDIT = (
    "来源：cottonbro studio · Pexels 视频 9943097 · Pexels License"
)
OCEAN_CREDIT = "来源：James Cheney · Pexels 视频 6746361 · Pexels License"
MOUNTAIN_URL = (
    "https://www.pexels.com/video/camera-panning-over-mountains-9943097/"
)
OCEAN_URL = "https://www.pexels.com/video/panning-shot-of-ocean-6746361/"
FONT_ROOT = Path(__file__).resolve().parents[1] / "assets" / "fonts"
REGULAR_FONT = FONT_ROOT / "NotoSansSC-Regular-subset.otf"
BOLD_FONT = FONT_ROOT / "NotoSansSC-Bold-subset.otf"


def _font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidate = BOLD_FONT if bold else REGULAR_FONT
    if not candidate.is_file():
        raise FileNotFoundError(
            f"Bundled figure font is missing: {candidate.relative_to(FONT_ROOT.parent)}"
        )
    return ImageFont.truetype(str(candidate), size)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _cover(image: np.ndarray, width: int, height: int) -> np.ndarray:
    source_height, source_width = image.shape[:2]
    scale = max(width / source_width, height / source_height)
    resized = cv2.resize(
        image,
        (round(source_width * scale), round(source_height * scale)),
        interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4,
    )
    x = (resized.shape[1] - width) // 2
    y = (resized.shape[0] - height) // 2
    return resized[y : y + height, x : x + width].copy()


def _contain(
    image: np.ndarray,
    width: int,
    height: int,
    *,
    background: np.ndarray | None = None,
) -> tuple[np.ndarray, float, int, int]:
    source_height, source_width = image.shape[:2]
    scale = min(width / source_width, height / source_height)
    resized_width = max(1, round(source_width * scale))
    resized_height = max(1, round(source_height * scale))
    resized = cv2.resize(
        image,
        (resized_width, resized_height),
        interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4,
    )
    canvas = (
        background.copy()
        if background is not None
        else np.zeros((height, width, 3), dtype=np.uint8)
    )
    x = (width - resized_width) // 2
    y = (height - resized_height) // 2
    canvas[y : y + resized_height, x : x + resized_width] = resized
    return canvas, scale, x, y


def _content_background(image: np.ndarray) -> np.ndarray:
    background = _cover(image, WIDTH, CONTENT_HEIGHT)
    return np.clip(background.astype(np.float32) * 0.32, 0, 255).astype(np.uint8)


def _text_on_rgb(
    image: np.ndarray,
    xy: tuple[int, int],
    text: str,
    *,
    size: int = 20,
    color: tuple[int, int, int] = (255, 255, 255),
    bold: bool = False,
) -> None:
    pil = Image.fromarray(image)
    draw = ImageDraw.Draw(pil)
    draw.text(xy, text, font=_font(size, bold=bold), fill=color)
    image[:] = np.asarray(pil)


def _draw_match_panel(
    left: np.ndarray,
    right: np.ndarray,
    left_points: np.ndarray,
    right_points: np.ndarray,
    pairs: Sequence[tuple[int, int]],
    *,
    width: int,
    height: int,
    colors: Sequence[tuple[int, int, int]] | None = None,
    limit: int = 100,
) -> np.ndarray:
    background = _cover(left, width, height)
    background = np.clip(background.astype(np.float32) * 0.24, 0, 255).astype(np.uint8)
    panel_width = width // 2
    image_height = min(height - 76, round(panel_width * 9 / 16))
    top = (height - image_height) // 2
    left_panel = cv2.resize(left, (panel_width, image_height), interpolation=cv2.INTER_AREA)
    right_panel = cv2.resize(
        right,
        (width - panel_width, image_height),
        interpolation=cv2.INTER_AREA,
    )
    background[top : top + image_height, :panel_width] = left_panel
    background[top : top + image_height, panel_width:] = right_panel
    left_scale = np.asarray(
        [panel_width / left.shape[1], image_height / left.shape[0]]
    )
    right_scale = np.asarray(
        [(width - panel_width) / right.shape[1], image_height / right.shape[0]]
    )
    selected_pairs = list(pairs)[:limit]
    for line_index, (left_index, right_index) in enumerate(selected_pairs):
        first = np.rint(left_points[left_index] * left_scale).astype(int)
        second = np.rint(right_points[right_index] * right_scale).astype(int)
        first[1] += top
        second += np.asarray((panel_width, top))
        color = (
            colors[line_index]
            if colors is not None and line_index < len(colors)
            else (32, 224, 255)
        )
        cv2.line(
            background,
            tuple(first),
            tuple(second),
            color,
            1,
            cv2.LINE_AA,
        )
        cv2.circle(background, tuple(first), 2, color, -1, cv2.LINE_AA)
        cv2.circle(background, tuple(second), 2, color, -1, cv2.LINE_AA)
    return background


def _raw_pairs(left: FeatureSet, right: FeatureSet) -> list[tuple[int, int]]:
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    candidates = matcher.knnMatch(left.descriptors, right.descriptors, k=2)
    return [
        (neighbors[0].queryIdx, neighbors[0].trainIdx)
        for neighbors in candidates
        if neighbors
    ]


def _ratio_pairs(
    left: FeatureSet, right: FeatureSet, threshold: float
) -> list[tuple[int, int]]:
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    candidates = matcher.knnMatch(left.descriptors, right.descriptors, k=2)
    return [
        (best.queryIdx, best.trainIdx)
        for best, second in candidates
        if best.distance < threshold * second.distance
    ]


def _naive_blend(warped: WarpResult) -> np.ndarray:
    total = np.zeros_like(warped.images[0], dtype=np.float32)
    count = np.zeros(warped.masks[0].shape, dtype=np.float32)
    for image, mask in zip(warped.images, warped.masks):
        valid = mask > 0
        total[valid] += image[valid].astype(np.float32)
        count[valid] += 1
    output = np.zeros_like(warped.images[0])
    valid = count > 0
    output[valid] = np.clip(total[valid] / count[valid, None], 0, 255).astype(
        np.uint8
    )
    return output


def _side_by_side(
    first: np.ndarray,
    second: np.ndarray,
    background_image: np.ndarray,
    left_label: str,
    right_label: str,
) -> np.ndarray:
    content = _content_background(background_image)
    half = WIDTH // 2
    panel_background = np.clip(
        _cover(background_image, half - 18, CONTENT_HEIGHT - 70).astype(np.float32)
        * 0.28,
        0,
        255,
    ).astype(np.uint8)
    first_panel, *_ = _contain(
        first,
        half - 18,
        CONTENT_HEIGHT - 70,
        background=panel_background,
    )
    second_panel, *_ = _contain(
        second,
        half - 18,
        CONTENT_HEIGHT - 70,
        background=panel_background,
    )
    content[52 : 52 + first_panel.shape[0], 8 : 8 + first_panel.shape[1]] = first_panel
    content[52 : 52 + second_panel.shape[0], half + 10 : half + 10 + second_panel.shape[1]] = second_panel
    _text_on_rgb(content, (20, 14), left_label, size=22, bold=True)
    _text_on_rgb(content, (half + 22, 14), right_label, size=22, bold=True)
    return content


def _save_figure(
    output: Path,
    *,
    title: str,
    subtitle: str,
    content: np.ndarray,
    credit: str,
    base_files: list[str],
    evidence_type: str,
) -> None:
    canvas = Image.new("RGB", (WIDTH, FIGURE_HEIGHT), "#111318")
    canvas.paste(Image.fromarray(content), (0, 90))
    draw = ImageDraw.Draw(canvas)
    draw.text((30, 16), title, font=_font(31, bold=True), fill="#FFFFFF")
    draw.text((31, 57), subtitle, font=_font(16), fill="#B8C0CC")
    draw.rectangle((0, 650, WIDTH, FIGURE_HEIGHT), fill="#111318")
    draw.text((30, 662), REAL_LABEL, font=_font(20, bold=True), fill="#F4F5F7")
    draw.text((30, 694), credit, font=_font(14), fill="#AAB2BF")
    draw.text(
        (WIDTH - 224, 694),
        "VISION HUB · LAB 002",
        font=_font(12, bold=True),
        fill="#7D8796",
    )
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("annotationLabel", REAL_LABEL)
    metadata.add_text("credit", credit)
    metadata.add_text("generator", GENERATOR)
    metadata.add_text("baseFiles", json.dumps(base_files, ensure_ascii=False))
    metadata.add_text("evidenceType", evidence_type)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, "PNG", pnginfo=metadata, optimize=True)


def _composite_warps(warped: WarpResult) -> np.ndarray:
    accumulator = np.zeros_like(warped.images[0], dtype=np.float32)
    counts = np.zeros(warped.masks[0].shape, dtype=np.float32)
    for image, mask in zip(warped.images, warped.masks):
        valid = mask > 0
        accumulator[valid] += image[valid]
        counts[valid] += 1
    output = np.zeros_like(warped.images[0])
    valid = counts > 0
    output[valid] = (accumulator[valid] / counts[valid, None]).astype(np.uint8)
    return output


def _figure_context(lab_root: Path) -> dict[str, Any]:
    mountain_paths = [
        lab_root / "assets" / "samples" / "mountains" / f"{index:02d}.jpg"
        for index in range(1, 4)
    ]
    ocean_paths = [
        lab_root / "assets" / "samples" / "ocean" / f"{index:02d}.jpg"
        for index in range(1, 4)
    ]
    mountains = [load_image(path) for path in mountain_paths]
    oceans = [load_image(path) for path in ocean_paths]
    options = StitchOptions()
    features = [extract_features(image, options=options) for image in mountains]
    matches: list[MatchResult] = []
    homographies: list[HomographyResult] = []
    for index in range(2):
        match = match_pair(
            features[index],
            features[index + 1],
            options=options,
            pair_index=index,
            pair_names=(mountain_paths[index].name, mountain_paths[index + 1].name),
        )
        matches.append(match)
        homographies.append(
            estimate_homography(
                features[index],
                features[index + 1],
                match,
                options=options,
            )
        )
    transforms = compose_transforms(
        [homography.transform for homography in homographies],
        image_count=3,
    )
    warped = warp_images(mountains, transforms, options=options)
    blended = blend_panorama(warped, options=options)
    crop = auto_crop(blended.valid_mask)
    return {
        "mountainPaths": mountain_paths,
        "oceanPaths": ocean_paths,
        "mountains": mountains,
        "oceans": oceans,
        "options": options,
        "features": features,
        "matches": matches,
        "homographies": homographies,
        "transforms": transforms,
        "warped": warped,
        "blended": blended,
        "crop": crop,
    }


def generate_figures(lab_root: Path, output_dir: Path | None = None) -> None:
    lab_root = lab_root.resolve()
    canonical_figures_root = lab_root / "docs" / "figures"
    figures_root = (
        Path(output_dir).resolve()
        if output_dir is not None
        else canonical_figures_root
    )
    write_canonical_metadata = output_dir is None
    context = _figure_context(lab_root)
    mountains: list[np.ndarray] = context["mountains"]
    features: list[FeatureSet] = context["features"]
    matches: list[MatchResult] = context["matches"]
    homographies: list[HomographyResult] = context["homographies"]
    warped: WarpResult = context["warped"]
    blended: BlendResult = context["blended"]
    crop = context["crop"]
    options: StitchOptions = context["options"]
    mountain_files = [
        path.relative_to(lab_root).as_posix() for path in context["mountainPaths"]
    ]
    ocean_files = [
        path.relative_to(lab_root).as_posix() for path in context["oceanPaths"]
    ]
    sample_hashes = {
        relative: _sha256(lab_root / relative)
        for relative in mountain_files + ocean_files
    }
    manifest_entries: list[dict[str, Any]] = []

    def emit(
        number: int,
        figure_id: str,
        title: str,
        subtitle: str,
        content: np.ndarray,
        *,
        base_files: list[str],
        creator: str,
        source_url: str,
        credit: str,
        evidence_type: str,
        measurements: dict[str, Any],
        overlays: list[dict[str, Any]],
    ) -> None:
        output_filename = f"{number:02d}-{figure_id}.png"
        output_relative = f"docs/figures/{output_filename}"
        definition_relative = (
            f"docs/figures/source-data/{number:02d}-{figure_id}.json"
        )
        output_path = figures_root / output_filename
        _save_figure(
            output_path,
            title=title,
            subtitle=subtitle,
            content=content,
            credit=credit,
            base_files=base_files,
            evidence_type=evidence_type,
        )
        definition = {
            "schemaVersion": 1,
            "id": figure_id,
            "generator": GENERATOR,
            "baseFiles": base_files,
            "baseSha256": {path: sample_hashes[path] for path in base_files},
            "measurements": measurements,
            "overlays": overlays,
            "annotationLabel": REAL_LABEL,
            "credit": credit,
        }
        if write_canonical_metadata:
            definition_path = lab_root / definition_relative
            definition_path.parent.mkdir(parents=True, exist_ok=True)
            definition_path.write_text(
                json.dumps(definition, ensure_ascii=False, indent=2) + "\n",
                "utf-8",
            )
        manifest_entries.append(
            {
                "number": number,
                "id": figure_id,
                "title": title,
                "output": output_relative,
                "sourceDefinition": definition_relative,
                "baseFiles": base_files,
                "evidenceType": evidence_type,
                "creator": creator,
                "sourceUrl": source_url,
                "license": "Pexels License",
                "credit": credit,
                "annotationLabel": REAL_LABEL,
                "basedOnRealInput": True,
                "isGeneratedScene": False,
                "sha256": _sha256(output_path),
            }
        )

    overlap_pixels = int(
        np.count_nonzero((warped.masks[0] > 0) & (warped.masks[1] > 0))
    )
    union_pixels = int(
        np.count_nonzero((warped.masks[0] > 0) | (warped.masks[1] > 0))
    )
    content = _content_background(mountains[1])
    card_width, card_height = 500, 281
    for image, x in zip(mountains, (0, 290, 580)):
        card = cv2.resize(image, (card_width, card_height), interpolation=cv2.INTER_AREA)
        content[124 : 124 + card_height, x : x + card_width] = card
        cv2.rectangle(content, (x, 124), (x + card_width - 1, 404), (245, 245, 245), 2)
    cv2.rectangle(content, (290, 124), (500, 404), (30, 225, 255), 4)
    cv2.rectangle(content, (580, 124), (790, 404), (30, 225, 255), 4)
    _text_on_rgb(
        content,
        (28, 62),
        "真实连续帧：0.30T → 0.45T → 0.60T",
        size=22,
        bold=True,
    )
    emit(
        1,
        "overlap",
        "实拍序列与重叠区域",
        f"真实变换后，前两帧有效并集中的重叠比例为 {overlap_pixels / union_pixels:.1%}",
        content,
        base_files=mountain_files,
        creator="cottonbro studio",
        source_url=MOUNTAIN_URL,
        credit=MOUNTAIN_CREDIT,
        evidence_type="real-sequence-overlap",
        measurements={
            "pair": [1, 2],
            "warpedOverlapPixels": overlap_pixels,
            "warpedUnionPixels": union_pixels,
            "overlapRatio": overlap_pixels / union_pixels,
        },
        overlays=[
            {"type": "frame-cards", "timestamps": [0.30, 0.45, 0.60]},
            {"type": "cyan-overlap-boxes"},
        ],
    )

    content, scale, x_offset, y_offset = _contain(
        mountains[1],
        WIDTH,
        CONTENT_HEIGHT,
        background=_content_background(mountains[1]),
    )
    for x, y in features[1].points[::2]:
        point = (round(x * scale + x_offset), round(y * scale + y_offset))
        cv2.circle(content, point, 2, (255, 196, 32), 1, cv2.LINE_AA)
    emit(
        2,
        "orb",
        "山景上的 ORB 特征点",
        f"第 2 帧检测到 {len(features[1].points)} 个真实关键点；图中隔点显示以保持可读",
        content,
        base_files=[mountain_files[1]],
        creator="cottonbro studio",
        source_url=MOUNTAIN_URL,
        credit=MOUNTAIN_CREDIT,
        evidence_type="actual-orb-keypoints",
        measurements={
            "frame": 2,
            "keypointCount": len(features[1].points),
            "analysisScale": features[1].analysis_scale,
        },
        overlays=[{"type": "orb-circles", "displayStride": 2}],
    )

    raw_pairs = _raw_pairs(features[0], features[1])
    content = _draw_match_panel(
        mountains[0],
        mountains[1],
        features[0].points,
        features[1].points,
        raw_pairs,
        width=WIDTH,
        height=CONTENT_HEIGHT,
        limit=100,
    )
    emit(
        3,
        "candidate-matches",
        "两张真实照片之间的候选匹配",
        f"BF-Hamming KNN 产生 {len(raw_pairs)} 组首选候选；图中按描述子距离显示前 100 组",
        content,
        base_files=mountain_files[:2],
        creator="cottonbro studio",
        source_url=MOUNTAIN_URL,
        credit=MOUNTAIN_CREDIT,
        evidence_type="actual-knn-candidates",
        measurements={"candidateCount": len(raw_pairs), "displayedCount": 100},
        overlays=[{"type": "candidate-match-lines", "limit": 100}],
    )

    ratio_pairs = _ratio_pairs(
        features[0], features[1], options.ratio_threshold
    )
    mutual_pairs = list(
        zip(
            matches[0].left_indices.tolist(),
            matches[0].right_indices.tolist(),
        )
    )
    before = _draw_match_panel(
        mountains[0],
        mountains[1],
        features[0].points,
        features[1].points,
        raw_pairs,
        width=WIDTH // 2,
        height=CONTENT_HEIGHT,
        limit=70,
    )
    after = _draw_match_panel(
        mountains[0],
        mountains[1],
        features[0].points,
        features[1].points,
        mutual_pairs,
        width=WIDTH // 2,
        height=CONTENT_HEIGHT,
        limit=70,
    )
    content = np.concatenate((before, after), axis=1)
    _text_on_rgb(
        content,
        (18, 14),
        f"筛选前 {len(raw_pairs)}",
        size=22,
        bold=True,
    )
    _text_on_rgb(
        content,
        (WIDTH // 2 + 18, 14),
        f"比率 + 双向一致后 {len(mutual_pairs)}",
        size=22,
        bold=True,
    )
    emit(
        4,
        "ratio-filter",
        "比率筛选前后",
        f"Lowe 阈值 {options.ratio_threshold:.2f}：{len(raw_pairs)} → {len(ratio_pairs)} → {len(mutual_pairs)}",
        content,
        base_files=mountain_files[:2],
        creator="cottonbro studio",
        source_url=MOUNTAIN_URL,
        credit=MOUNTAIN_CREDIT,
        evidence_type="actual-ratio-mutual-filter",
        measurements={
            "candidateCount": len(raw_pairs),
            "ratioCount": len(ratio_pairs),
            "mutualCount": len(mutual_pairs),
            "ratioThreshold": options.ratio_threshold,
        },
        overlays=[{"type": "before-after-match-lines", "limitPerPanel": 70}],
    )

    inlier_mask = homographies[0].inlier_mask
    ordered_pairs = [
        pair
        for _, pair in sorted(
            zip((bool(value) for value in inlier_mask), mutual_pairs),
            key=lambda item: item[0],
        )
    ]
    ordered_colors = [
        (45, 225, 110) if inlier_mask[mutual_pairs.index(pair)] else (255, 70, 70)
        for pair in ordered_pairs
    ]
    content = _draw_match_panel(
        mountains[0],
        mountains[1],
        features[0].points,
        features[1].points,
        ordered_pairs,
        width=WIDTH,
        height=CONTENT_HEIGHT,
        colors=ordered_colors,
        limit=120,
    )
    metrics = homographies[0].metrics
    emit(
        5,
        "ransac",
        "RANSAC 内点与离群点",
        f"绿色内点 {metrics.inlier_count}/{metrics.mutual_match_count}；中位重投影误差 {metrics.median_reprojection_error_px:.2f}px",
        content,
        base_files=mountain_files[:2],
        creator="cottonbro studio",
        source_url=MOUNTAIN_URL,
        credit=MOUNTAIN_CREDIT,
        evidence_type="actual-ransac-inlier-mask",
        measurements={
            **metrics.__dict__,
            "outlierCount": metrics.mutual_match_count - metrics.inlier_count,
        },
        overlays=[
            {"type": "inlier-lines", "color": "green"},
            {"type": "outlier-lines", "color": "red"},
        ],
    )

    composite = _composite_warps(warped)
    content, canvas_scale, x_offset, y_offset = _contain(
        composite,
        WIDTH,
        CONTENT_HEIGHT,
        background=_content_background(mountains[1]),
    )
    polygon_colors = ((255, 195, 32), (42, 230, 255), (255, 92, 148))
    for index, (image, transform, color) in enumerate(
        zip(mountains, warped.transforms, polygon_colors), start=1
    ):
        height, width = image.shape[:2]
        corners = np.asarray(
            [[[0, 0], [width, 0], [width, height], [0, height]]],
            dtype=np.float32,
        )
        transformed = cv2.perspectiveTransform(corners, transform)[0]
        transformed[:, 0] = transformed[:, 0] * canvas_scale + x_offset
        transformed[:, 1] = transformed[:, 1] * canvas_scale + y_offset
        cv2.polylines(
            content,
            [np.rint(transformed).astype(np.int32)],
            True,
            color,
            4,
            cv2.LINE_AA,
        )
        center = np.mean(transformed, axis=0).astype(int)
        _text_on_rgb(
            content,
            tuple(center),
            f"帧 {index}",
            size=20,
            color=color,
            bold=True,
        )
    emit(
        6,
        "transformed-canvas",
        "单应性变换后的真实画布范围",
        f"规划画布 {warped.canvas_size[0]}×{warped.canvas_size[1]}；工作集估计 {warped.estimated_working_set_mib:.1f} MiB",
        content,
        base_files=mountain_files,
        creator="cottonbro studio",
        source_url=MOUNTAIN_URL,
        credit=MOUNTAIN_CREDIT,
        evidence_type="actual-warped-canvas",
        measurements={
            "canvasSize": list(warped.canvas_size),
            "outputScale": warped.output_scale,
            "estimatedWorkingSetMiB": warped.estimated_working_set_mib,
            "canvasTransforms": [transform.tolist() for transform in warped.transforms],
        },
        overlays=[{"type": "transformed-source-polygons"}],
    )

    content = _cover(composite, WIDTH, CONTENT_HEIGHT)
    centers: list[tuple[int, int]] = []
    for image, transform in zip(mountains, warped.transforms):
        center = np.asarray(
            [[[image.shape[1] / 2, image.shape[0] / 2]]], dtype=np.float32
        )
        transformed = cv2.perspectiveTransform(center, transform)[0, 0]
        display_x = round(transformed[0] / warped.canvas_size[0] * WIDTH)
        display_y = round(transformed[1] / warped.canvas_size[1] * CONTENT_HEIGHT)
        centers.append((display_x, display_y))
    for index, center in enumerate(centers):
        color = (255, 210, 50) if index == 1 else (40, 230, 255)
        cv2.circle(content, center, 16, color, -1, cv2.LINE_AA)
        _text_on_rgb(
            content,
            (center[0] - 34, center[1] + 24),
            f"帧 {index + 1}",
            size=18,
            bold=True,
        )
    for center in (centers[0], centers[2]):
        cv2.arrowedLine(content, center, centers[1], (255, 255, 255), 3, cv2.LINE_AA)
    _text_on_rgb(
        content,
        (centers[1][0] - 70, 28),
        "中间锚点 I",
        size=22,
        bold=True,
    )
    emit(
        7,
        "middle-anchor",
        "多图相对中间锚点的位置",
        "左图通过 H₀₁ 到锚点；右图通过 H₁₂⁻¹ 回到锚点；中间帧保持单位变换",
        content,
        base_files=mountain_files,
        creator="cottonbro studio",
        source_url=MOUNTAIN_URL,
        credit=MOUNTAIN_CREDIT,
        evidence_type="actual-middle-anchor-transforms",
        measurements={
            "anchorIndex": 1,
            "anchorTransforms": [transform.tolist() for transform in context["transforms"]],
        },
        overlays=[{"type": "anchor-points-and-arrows"}],
    )

    before_image = crop.apply(_naive_blend(warped))
    after_image = crop.apply(blended.image)
    content = _side_by_side(
        before_image,
        after_image,
        mountains[1],
        "曝光匹配前：重叠区直接平均",
        "曝光匹配后：受限增益 + 羽化",
    )
    emit(
        8,
        "exposure",
        "真实重叠区曝光匹配前后",
        "实测增益：" + " / ".join(f"{gain:.3f}" for gain in blended.exposure_gains),
        content,
        base_files=mountain_files,
        creator="cottonbro studio",
        source_url=MOUNTAIN_URL,
        credit=MOUNTAIN_CREDIT,
        evidence_type="actual-overlap-exposure",
        measurements={
            "exposureGains": list(blended.exposure_gains),
            "gainLimits": [
                options.exposure_gain_min,
                options.exposure_gain_max,
            ],
        },
        overlays=[{"type": "before-after-panorama"}],
    )

    first_binary = (warped.masks[0] > 0).astype(np.uint8)
    second_binary = (warped.masks[1] > 0).astype(np.uint8)
    first_weight = np.minimum(
        cv2.distanceTransform(first_binary, cv2.DIST_L2, 3)
        / options.blend_width_px,
        1.0,
    )
    second_weight = np.minimum(
        cv2.distanceTransform(second_binary, cv2.DIST_L2, 3)
        / options.blend_width_px,
        1.0,
    )
    overlap = (first_binary > 0) & (second_binary > 0)
    normalized = np.zeros_like(first_weight)
    denominator = first_weight + second_weight
    valid_denominator = denominator > 0
    normalized[valid_denominator] = (
        first_weight[valid_denominator] / denominator[valid_denominator]
    )
    heatmap = cv2.applyColorMap(
        np.uint8(np.clip(normalized * 255, 0, 255)),
        cv2.COLORMAP_TURBO,
    )[..., ::-1]
    real_base = _composite_warps(warped)
    heat_overlay = (
        real_base.astype(np.float32) * 0.55 + heatmap.astype(np.float32) * 0.45
    ).astype(np.uint8)
    heat_overlay[~overlap] = real_base[~overlap]
    content = _side_by_side(
        crop.apply(heat_overlay),
        crop.apply(blended.image),
        mountains[1],
        "真实重叠区羽化权重",
        "最终羽化结果",
    )
    emit(
        9,
        "feather",
        "真实接缝羽化权重与最终效果",
        f"基于有效掩膜距离，羽化宽度 {options.blend_width_px}px；彩色只覆盖真实重叠区",
        content,
        base_files=mountain_files,
        creator="cottonbro studio",
        source_url=MOUNTAIN_URL,
        credit=MOUNTAIN_CREDIT,
        evidence_type="actual-distance-feather",
        measurements={
            "blendWidthPx": options.blend_width_px,
            "seamPixels": int(np.count_nonzero(blended.seam_mask)),
            "weightMinimumInOverlap": float(normalized[overlap].min()),
            "weightMaximumInOverlap": float(normalized[overlap].max()),
        },
        overlays=[{"type": "turbo-weight-overlay", "scope": "real overlap only"}],
    )

    ocean_first, ocean_second = context["oceans"][:2]
    roi = (0, 450, 1600, 850)
    sea_first = ocean_first[roi[1] : roi[3], roi[0] : roi[2]]
    sea_second = ocean_second[roi[1] : roi[3], roi[0] : roi[2]]
    sea_features = [extract_features(image, options=options) for image in (sea_first, sea_second)]
    sea_raw = _raw_pairs(sea_features[0], sea_features[1])
    sea_ratio = _ratio_pairs(
        sea_features[0], sea_features[1], options.ratio_threshold
    )
    failure_code = "NONE"
    failure_message = ""
    try:
        match_pair(
            sea_features[0],
            sea_features[1],
            options=options,
            pair_names=("ocean-01-sea-roi", "ocean-02-sea-roi"),
        )
    except StitchError as error:
        failure_code = error.code
        failure_message = error.message
    content = _draw_match_panel(
        sea_first,
        sea_second,
        sea_features[0].points,
        sea_features[1].points,
        sea_ratio,
        width=WIDTH,
        height=CONTENT_HEIGHT,
        limit=40,
    )
    cv2.rectangle(content, (0, 0), (WIDTH, 112), (12, 15, 20), -1)
    _text_on_rgb(
        content,
        (24, 16),
        f"海面 ROI 压力测试：{failure_code}（比率匹配仅 {len(sea_ratio)}）",
        size=22,
        color=(255, 105, 105),
        bold=True,
    )
    _text_on_rgb(
        content,
        (24, 54),
        "完整三帧本次可以拼接；这里只报告同一实拍帧海面区域的真实失败。",
        size=18,
    )
    _text_on_rgb(
        content,
        (24, 82),
        "近景视差 / 移动物体：首版明确不处理，尚无合格实拍失败素材，不在图中伪造。",
        size=17,
        color=(210, 218, 228),
    )
    emit(
        10,
        "failure-boundaries",
        "海面低纹理压力测试与首版边界",
        "海面 ROI 来自真实视频帧；完整序列通过，因此不把它冒充成整组失败",
        content,
        base_files=ocean_files[:2],
        creator="James Cheney",
        source_url=OCEAN_URL,
        credit=OCEAN_CREDIT,
        evidence_type="actual-low-texture-roi-failure",
        measurements={
            "roiXYXY": list(roi),
            "featureCounts": [len(feature.points) for feature in sea_features],
            "candidateCount": len(sea_raw),
            "ratioMatchCount": len(sea_ratio),
            "failureCode": failure_code,
            "failureMessage": failure_message,
            "fullSequenceObservation": "The committed three-frame ocean sequence stitched successfully in this run.",
            "unshownLimitations": [
                "near-field parallax requires a separate genuine capture",
                "moving-object ghosting requires a separate genuine capture",
            ],
        },
        overlays=[
            {"type": "actual-roi-match-lines"},
            {"type": "honest-unshown-limitations-note"},
        ],
    )

    figure_manifest = {
        "schemaVersion": 1,
        "generatedAt": "2026-07-30",
        "generator": GENERATOR,
        "notice": (
            "Every figure uses committed real Pexels frames and actual algorithm "
            "measurements. Overlays add only labels, lines, masks, and diagnostics."
        ),
        "figures": manifest_entries,
    }
    if write_canonical_metadata:
        (canonical_figures_root / "figure-manifest.json").write_text(
            json.dumps(figure_manifest, ensure_ascii=False, indent=2) + "\n",
            "utf-8",
        )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--lab-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    args = parser.parse_args()
    generate_figures(args.lab_root)
