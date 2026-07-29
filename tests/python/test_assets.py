from __future__ import annotations

import json
import hashlib
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
FIGURES = ROOT / "docs" / "figures"
DEMO = ROOT / "demo"
LOGO_SOURCE = ASSETS / "source" / "vision-hub-logo-corrected.png"
LOGO_SHA256 = "260f7d0618333219809927590195721d41acca312bd40ea7e86300178e2d254b"

BACKGROUND_NAMES = ("wall.jpg", "packaging.jpg", "screen.jpg")
OVERLAY_NAMES = ("vision-hub-mark.png", "lab-poster.png", "screen-ui.png")
FIGURE_STEMS = (
    "01-before-after",
    "02-vanishing-points",
    "03-homography",
    "04-pipeline",
    "05-control-points",
    "06-blend-modes",
    "07-texture",
    "08-boundaries",
    "09-shortcuts",
    "10-dual-runtime",
)


def test_example_backgrounds_are_nontrivial_1600x1200_jpegs() -> None:
    for name in BACKGROUND_NAMES:
        path = ASSETS / "examples" / name
        with Image.open(path) as image:
            pixels = np.asarray(image.convert("RGB"), dtype=np.float32)
            assert image.size == (1600, 1200)
            assert image.format == "JPEG"
            assert float(pixels.std()) > 12.0
            # The packaging reference is intentionally near-monochrome, so
            # require a meaningful tonal range without rejecting a real
            # grayscale product photograph.
            assert np.unique(pixels.reshape(-1, 3), axis=0).shape[0] > 100


def test_overlay_assets_are_transparent_1200x800_with_meaningful_coverage() -> None:
    for name in OVERLAY_NAMES:
        path = ASSETS / "examples" / name
        with Image.open(path) as image:
            rgba = np.asarray(image.convert("RGBA"))
            alpha = rgba[..., 3]
            assert image.size == (1200, 800)
            assert image.mode == "RGBA"
            assert all(alpha[y, x] == 0 for x, y in ((0, 0), (1199, 0), (0, 799), (1199, 799)))
            coverage = np.count_nonzero(alpha) / alpha.size
            assert 0.05 < coverage < 0.9
            assert alpha.max() == 255


def test_lab_poster_contains_required_exact_copy_in_manifest() -> None:
    manifest = json.loads((ASSETS / "asset-manifest.json").read_text(encoding="utf-8"))
    poster = next(item for item in manifest["assets"] if item["filename"] == "lab-poster.png")
    assert poster["text"] == ["LAB 001", "PERSPECTIVE PASTE"]


def test_asset_manifest_separates_third_party_and_original_licenses() -> None:
    manifest_path = ASSETS / "asset-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    items = manifest["assets"]
    assert len(items) == 6
    assert {item["filename"] for item in items} == set(BACKGROUND_NAMES + OVERLAY_NAMES)
    for item in items:
        assert item["kind"] in {"background", "overlay"}
        assert item["dimensions"] in ([1600, 1200], [1200, 800])
        assert item["method"]
        assert item["source"]
        assert item["provenance"]
        assert item["purpose"]
    backgrounds = [item for item in items if item["kind"] == "background"]
    overlays = [item for item in items if item["kind"] == "overlay"]
    assert all(item["license"] == "Pexels License" for item in backgrounds)
    assert all(item["license"] == "CC BY 4.0" for item in overlays)
    for item in backgrounds:
        assert item["title"]
        assert item["creator"]
        assert item["sourceUrl"].startswith("https://www.pexels.com/photo/")
        assert item["downloadedAt"] == "2026-07-29"
        assert item["modifications"]


def test_original_synthetic_backgrounds_remain_as_offline_fallbacks() -> None:
    fallback_dir = ASSETS / "examples" / "synthetic"
    for name in BACKGROUND_NAMES:
        with Image.open(fallback_dir / name) as image:
            assert image.size == (1600, 1200)
            assert image.format == "JPEG"


def test_corrected_logo_source_is_vendored_and_manifest_paths_are_relative() -> None:
    source_files = sorted(path.name for path in (ASSETS / "source").iterdir() if path.is_file())
    assert source_files == ["vision-hub-logo-corrected.png"]
    assert hashlib.sha256(LOGO_SOURCE.read_bytes()).hexdigest() == LOGO_SHA256
    manifest = json.loads((ASSETS / "asset-manifest.json").read_text(encoding="utf-8"))
    mark = next(item for item in manifest["assets"] if item["filename"] == "vision-hub-mark.png")
    assert mark["source"] == "assets/source/vision-hub-logo-corrected.png"
    assert LOGO_SHA256 in mark["provenance"].lower()


def test_ten_editable_svgs_and_matching_1080px_pngs_exist() -> None:
    assert sorted(path.stem for path in FIGURES.glob("*.svg")) == list(FIGURE_STEMS)
    assert sorted(path.stem for path in FIGURES.glob("*.png")) == list(FIGURE_STEMS)
    for stem in FIGURE_STEMS:
        svg_path = FIGURES / f"{stem}.svg"
        root = ET.parse(svg_path).getroot()
        assert root.tag.endswith("svg")
        assert root.attrib["viewBox"] == "0 0 1080 675"
        svg_text = svg_path.read_text(encoding="utf-8")
        assert "Vision Hub" in svg_text
        assert any("\u4e00" <= char <= "\u9fff" for char in svg_text)
        with Image.open(FIGURES / f"{stem}.png") as image:
            assert image.size == (1080, 675)
            assert image.mode in {"RGB", "RGBA"}
            assert np.asarray(image.convert("RGB"), dtype=np.float32).std() > 10


def test_mp4_is_about_twelve_seconds_at_1080x1350_and_24fps() -> None:
    capture = cv2.VideoCapture(str(DEMO / "demo.mp4"))
    try:
        assert capture.isOpened()
        width = int(round(capture.get(cv2.CAP_PROP_FRAME_WIDTH)))
        height = int(round(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)))
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frames = int(round(capture.get(cv2.CAP_PROP_FRAME_COUNT)))
        assert (width, height) == (1080, 1350)
        assert abs(fps - 24.0) < 0.1
        assert 280 <= frames <= 296
        assert 11.5 <= frames / fps <= 12.5
    finally:
        capture.release()


def test_demo_gif_has_multiple_storyboard_frames() -> None:
    with Image.open(DEMO / "demo.gif") as image:
        assert image.size == (540, 675)
        assert getattr(image, "n_frames", 1) >= 24
        assert image.info["duration"] > 0


def test_playwright_recorder_drives_real_app_and_is_documented() -> None:
    recorder = ROOT / "scripts" / "record_demo.mjs"
    source = recorder.read_text(encoding="utf-8")
    assert "@playwright/test" in source
    assert "recordVideo" in source
    assert 'setInputFiles' in source
    assert '"#editor-canvas"' in source or "'#editor-canvas'" in source
    assert "mouse.move" in source
    assert "demo.webm" in source
    check = subprocess.run(
        ["node", "--check", str(recorder)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert check.returncode == 0, check.stderr
    readme = (DEMO / "README.md").read_text(encoding="utf-8")
    assert "node scripts/record_demo.mjs" in readme
    assert "Playwright" in readme


def test_playwright_webm_is_readable_and_about_twelve_seconds() -> None:
    capture = cv2.VideoCapture(str(DEMO / "demo.webm"))
    try:
        assert capture.isOpened()
        width = int(round(capture.get(cv2.CAP_PROP_FRAME_WIDTH)))
        height = int(round(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)))
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frames = int(round(capture.get(cv2.CAP_PROP_FRAME_COUNT)))
        assert (width, height) == (1080, 1350)
        assert fps > 0
        assert 9.0 <= frames / fps <= 16.0
    finally:
        capture.release()
