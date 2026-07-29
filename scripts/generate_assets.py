"""Generate the repository's original example imagery without network access."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "examples"
WEB_OUTPUT = ROOT / "web" / "assets" / "examples"
SYNTHETIC_OUTPUT = OUTPUT / "synthetic"
WEB_SYNTHETIC_OUTPUT = WEB_OUTPUT / "synthetic"
SOURCE_LOGO = ROOT / "assets" / "source" / "vision-hub-logo-corrected.png"
BLUE = (18, 106, 255)
INK = (10, 20, 38)
WHITE = (244, 248, 255)
GREEN = (45, 211, 153)
ORANGE = (255, 159, 67)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def textured_gradient(
    top: tuple[int, int, int],
    bottom: tuple[int, int, int],
    seed: int,
) -> Image.Image:
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, 1200, dtype=np.float32)[:, None, None]
    start = np.array(top, dtype=np.float32)[None, None, :]
    end = np.array(bottom, dtype=np.float32)[None, None, :]
    base = np.broadcast_to(start * (1 - y) + end * y, (1200, 1600, 3)).copy()
    noise = rng.normal(0, 7.5, base.shape[:2])[..., None]
    coarse = rng.normal(0, 1, (150, 200)).astype(np.float32)
    coarse = np.asarray(
        Image.fromarray(coarse).resize((1600, 1200), Image.Resampling.BICUBIC)
    )[..., None]
    pixels = np.clip(base + noise + coarse * 10, 0, 255).astype(np.uint8)
    return Image.fromarray(pixels)


def wall_background() -> Image.Image:
    image = textured_gradient((45, 54, 65), (149, 151, 146), seed=101)
    draw = ImageDraw.Draw(image, "RGBA")
    # Floor and an oblique concrete wall plane converge toward an off-frame vanishing point.
    draw.polygon([(0, 1090), (1600, 910), (1600, 1200), (0, 1200)], fill=(18, 25, 34, 235))
    draw.polygon([(0, 140), (1600, 0), (1600, 910), (0, 1090)], fill=(176, 183, 184, 110))
    for x in range(-100, 1800, 270):
        draw.line([(x, 1200), (800 + (x - 800) * 0.18, 470)], fill=(235, 241, 244, 24), width=3)
    for y in (370, 650, 890):
        draw.line([(0, y + 80), (1600, y - 70)], fill=(19, 32, 42, 32), width=4)
    draw.polygon([(205, 245), (1290, 142), (1360, 738), (255, 855)], outline=(7, 17, 27, 70), width=9)
    draw.ellipse((1160, 940, 1540, 1055), fill=(5, 11, 18, 100))
    return image.filter(ImageFilter.GaussianBlur(0.35))


def packaging_background() -> Image.Image:
    image = textured_gradient((23, 33, 50), (102, 77, 56), seed=202)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rectangle((0, 900, 1600, 1200), fill=(20, 26, 36, 225))
    # Blank package: light front plane and darker side plane, deliberately unbranded.
    front = [(300, 225), (1065, 155), (1085, 900), (320, 1015)]
    side = [(1065, 155), (1328, 315), (1338, 848), (1085, 900)]
    top = [(300, 225), (530, 92), (1328, 315), (1065, 155)]
    draw.polygon([(275, 1028), (1075, 910), (1390, 858), (1525, 998), (575, 1130)], fill=(0, 0, 0, 90))
    draw.polygon(front, fill=(218, 207, 185, 255), outline=(248, 239, 220, 150), width=5)
    draw.polygon(side, fill=(121, 100, 80, 255), outline=(238, 216, 184, 90), width=4)
    draw.polygon(top, fill=(238, 227, 204, 255), outline=(255, 250, 235, 110), width=4)
    for offset in range(8):
        draw.line([(350, 350 + offset * 52), (1020, 290 + offset * 49)], fill=(67, 58, 49, 18), width=2)
    draw.line([(320, 1015), (1085, 900)], fill=(255, 255, 255, 90), width=6)
    return image.filter(ImageFilter.GaussianBlur(0.25))


def screen_background() -> Image.Image:
    image = textured_gradient((7, 15, 31), (28, 43, 61), seed=303)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rectangle((0, 950, 1600, 1200), fill=(5, 9, 16, 245))
    draw.ellipse((270, 1010, 1390, 1160), fill=(0, 0, 0, 130))
    # A blank, slightly rotated display plane with enough context to read as hardware.
    bezel = [(210, 170), (1390, 230), (1322, 955), (270, 910)]
    plane = [(245, 205), (1355, 258), (1293, 910), (300, 870)]
    draw.polygon(bezel, fill=(8, 12, 19, 255), outline=(98, 126, 161, 180), width=8)
    draw.polygon(plane, fill=(31, 49, 69, 255))
    for y in range(270, 870, 70):
        t = (y - 205) / 705
        left = (int(245 + 55 * t), y)
        right = (int(1355 - 62 * t), y + 48)
        draw.line([left, right], fill=(86, 128, 169, 24), width=2)
    draw.polygon([(748, 932), (865, 937), (970, 1060), (625, 1050)], fill=(24, 32, 43, 255))
    draw.polygon([(625, 1050), (970, 1060), (1070, 1105), (535, 1095)], fill=(10, 16, 24, 255))
    draw.line([(260, 210), (1338, 262)], fill=(55, 163, 255, 85), width=3)
    return image


def make_logo_overlay() -> tuple[Image.Image, str]:
    source_bytes = SOURCE_LOGO.read_bytes()
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    source = Image.open(SOURCE_LOGO).convert("RGBA")
    pixels = np.asarray(source).copy()
    near_white = (
        (pixels[..., 0] >= 238)
        & (pixels[..., 1] >= 238)
        & (pixels[..., 2] >= 238)
        & ((pixels[..., :3].max(axis=2) - pixels[..., :3].min(axis=2)) < 18)
    )
    pixels[..., 3] = np.where(near_white, 0, pixels[..., 3])
    cleaned = Image.fromarray(pixels)
    bbox = cleaned.getbbox()
    if bbox is None:
        raise RuntimeError(f"No non-white logo content found in {SOURCE_LOGO}")
    cleaned = cleaned.crop(bbox)
    cleaned.thumbnail((1000, 620), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (1200, 800))
    canvas.alpha_composite(cleaned, ((1200 - cleaned.width) // 2, (800 - cleaned.height) // 2))
    return canvas, source_hash


def make_poster() -> Image.Image:
    canvas = Image.new("RGBA", (1200, 800))
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.rounded_rectangle((150, 70, 1050, 730), radius=36, fill=(8, 18, 34, 245), outline=BLUE + (255,), width=7)
    draw.rectangle((190, 112, 1010, 122), fill=GREEN + (255,))
    draw.text((205, 174), "LAB 001", font=font(112, True), fill=WHITE + (255,))
    draw.text((208, 322), "PERSPECTIVE", font=font(77, True), fill=BLUE + (255,))
    draw.text((208, 415), "PASTE", font=font(132, True), fill=WHITE + (255,))
    draw.line((208, 595, 960, 595), fill=ORANGE + (255,), width=9)
    draw.polygon([(885, 642), (970, 614), (950, 688)], fill=GREEN + (255,))
    return canvas


def make_screen_ui() -> Image.Image:
    canvas = Image.new("RGBA", (1200, 800))
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.rounded_rectangle((70, 55, 1130, 745), radius=30, fill=(8, 17, 31, 248), outline=(56, 77, 102, 255), width=4)
    draw.rounded_rectangle((70, 55, 1130, 135), radius=30, fill=(17, 31, 50, 255))
    draw.rectangle((70, 105, 1130, 135), fill=(17, 31, 50, 255))
    for x, color in ((112, ORANGE), (154, GREEN), (196, BLUE)):
        draw.ellipse((x - 10, 85, x + 10, 105), fill=color + (255,))
    draw.rounded_rectangle((100, 170, 320, 708), radius=18, fill=(13, 26, 43, 255))
    for i, width in enumerate((150, 120, 170, 105, 145)):
        y = 215 + i * 82
        draw.rounded_rectangle((135, y, 135 + width, y + 22), radius=9, fill=(72, 94, 120, 210))
    draw.rounded_rectangle((350, 170, 1095, 475), radius=18, fill=(13, 28, 48, 255))
    points = [(390, 405), (475, 352), (560, 375), (650, 270), (745, 308), (840, 220), (1035, 260)]
    draw.line(points, fill=BLUE + (255,), width=10, joint="curve")
    for point in points:
        draw.ellipse((point[0] - 10, point[1] - 10, point[0] + 10, point[1] + 10), fill=GREEN + (255,))
    for i, color in enumerate((BLUE, GREEN, ORANGE)):
        x = 350 + i * 250
        draw.rounded_rectangle((x, 505, x + 220, 708), radius=18, fill=(14, 29, 48, 255))
        draw.arc((x + 55, 545, x + 165, 655), 210, 530, fill=color + (255,), width=16)
    return canvas


def write_manifest(source_hash: str) -> None:
    common = {"license": "CC BY 4.0"}
    items = [
        {
            "filename": "wall.jpg",
            "kind": "background",
            "dimensions": [1600, 1200],
            "license": "Pexels License",
            "title": "Blank Billboard in Urban Street Setting",
            "creator": "Peter Dyllong",
            "sourceUrl": "https://www.pexels.com/photo/blank-billboard-in-urban-street-setting-36519146/",
            "downloadedAt": "2026-07-29",
            "modifications": "Cropped to remove the roadside sign, resized to 1600x1200, mild contrast/color adjustment, JPEG optimized",
            "method": "Licensed source photograph, deterministic crop and Lanczos resize",
            "source": "Pexels photo 36519146",
            "provenance": "Derived from the credited Pexels photograph; the unmodified original is not vendored.",
            "purpose": "Real outdoor billboard plane for perspective-paste demonstrations",
        },
        {
            "filename": "packaging.jpg",
            "kind": "background",
            "dimensions": [1600, 1200],
            "license": "Pexels License",
            "title": "White Cardboard Box on White Surface",
            "creator": "mockupbee",
            "sourceUrl": "https://www.pexels.com/photo/white-cardboard-box-on-white-surface-12039676/",
            "downloadedAt": "2026-07-29",
            "modifications": "Centered 4:3 crop, resized to 1600x1200, mild contrast/color adjustment, JPEG optimized",
            "method": "Licensed source photograph, deterministic crop and Lanczos resize",
            "source": "Pexels photo 12039676",
            "provenance": "Derived from the credited Pexels photograph; the unmodified original is not vendored.",
            "purpose": "Real blank packaging plane for mockup demonstrations",
        },
        {
            "filename": "screen.jpg",
            "kind": "background",
            "dimensions": [1600, 1200],
            "license": "Pexels License",
            "title": "TV in a Living Room",
            "creator": "Lisa Anna",
            "sourceUrl": "https://www.pexels.com/photo/tv-in-a-living-room-19866439/",
            "downloadedAt": "2026-07-29",
            "modifications": "Cropped around the unbranded television, resized to 1600x1200, mild contrast/color adjustment, JPEG optimized",
            "method": "Licensed source photograph, deterministic crop and Lanczos resize",
            "source": "Pexels photo 19866439",
            "provenance": "Derived from the credited Pexels photograph; the unmodified original is not vendored.",
            "purpose": "Real unbranded television plane for screen-replacement demonstrations",
        },
        {
            "filename": "vision-hub-mark.png",
            "kind": "overlay",
            "dimensions": [1200, 800],
            **common,
            "method": "Near-white background removal, alpha crop, and Lanczos resize",
            "source": "assets/source/vision-hub-logo-corrected.png",
            "provenance": f"Derived non-destructively from project-provided corrected logo; source SHA-256 {source_hash}",
            "purpose": "Transparent Vision Hub mark for planar placement examples",
        },
        {
            "filename": "lab-poster.png",
            "kind": "overlay",
            "dimensions": [1200, 800],
            **common,
            "method": "Original deterministic Pillow vector-style drawing",
            "source": "scripts/generate_assets.py",
            "provenance": "Original project artwork; no external visual assets",
            "purpose": "High-contrast poster for wall perspective demonstrations",
            "text": ["LAB 001", "PERSPECTIVE PASTE"],
        },
        {
            "filename": "screen-ui.png",
            "kind": "overlay",
            "dimensions": [1200, 800],
            **common,
            "method": "Original deterministic Pillow vector-style drawing",
            "source": "scripts/generate_assets.py",
            "provenance": "Original unbranded dashboard artwork; no external visual assets",
            "purpose": "Clean no-brand dashboard for display perspective demonstrations",
        },
    ]
    manifest = {
        "schemaVersion": 2,
        "licenseNotice": (
            "The three photographic backgrounds remain under the Pexels License. "
            "The three original overlays are licensed under CC BY 4.0."
        ),
        "assets": items,
    }
    (ROOT / "assets" / "asset-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    WEB_OUTPUT.mkdir(parents=True, exist_ok=True)
    SYNTHETIC_OUTPUT.mkdir(parents=True, exist_ok=True)
    WEB_SYNTHETIC_OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, image in (
        ("wall.jpg", wall_background()),
        ("packaging.jpg", packaging_background()),
        ("screen.jpg", screen_background()),
    ):
        image.save(SYNTHETIC_OUTPUT / name, "JPEG", quality=92, optimize=True, subsampling=0)
        shutil.copy2(SYNTHETIC_OUTPUT / name, WEB_SYNTHETIC_OUTPUT / name)
    logo, source_hash = make_logo_overlay()
    logo.save(OUTPUT / "vision-hub-mark.png", optimize=True)
    make_poster().save(OUTPUT / "lab-poster.png", optimize=True)
    make_screen_ui().save(OUTPUT / "screen-ui.png", optimize=True)
    for asset_path in OUTPUT.iterdir():
        if asset_path.is_file():
            shutil.copy2(asset_path, WEB_OUTPUT / asset_path.name)
    write_manifest(source_hash)
    print(
        "Generated 3 synthetic fallback backgrounds, 3 original overlays, "
        f"and the manifest in {OUTPUT.parent}; copied runtime assets to {WEB_OUTPUT}"
    )


if __name__ == "__main__":
    main()
