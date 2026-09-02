"""Generate the three five-state case studies with the product renderer."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from perspective_paste.app import _draw_perspective_overlay
from perspective_paste.blending import blend_composite
from perspective_paste.config import get_render_preset
from perspective_paste.renderer import load_png_layer


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "assets" / "examples"
OUTPUT = ROOT / "docs" / "cases"


@dataclass(frozen=True)
class Case:
    name: str
    background: str
    asset: str
    preset: str
    correct_quad: tuple[tuple[float, float], ...]
    wrong_quad: tuple[tuple[float, float], ...]


CASES = (
    Case(
        name="wall",
        background="wall.jpg",
        asset="lab-poster.png",
        preset="wall",
        correct_quad=((312, 58), (1442, 58), (1440, 736), (312, 718)),
        wrong_quad=((320, 130), (1390, 190), (1320, 760), (250, 690)),
    ),
    Case(
        name="court",
        background="court.jpg",
        asset="court-ad.png",
        preset="court",
        correct_quad=((440, 760), (980, 755), (1340, 1045), (140, 1075)),
        wrong_quad=((300, 760), (1080, 760), (1080, 1040), (300, 1040)),
    ),
    Case(
        name="facade",
        background="facade.jpg",
        asset="facade-logo.png",
        preset="facade",
        correct_quad=((660, 365), (1070, 270), (1160, 650), (610, 790)),
        wrong_quad=((650, 360), (1110, 360), (1110, 720), (650, 720)),
    ),
)


def save_jpeg(path: Path, pixels: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.asarray(pixels, dtype=np.uint8)).save(
        path,
        "JPEG",
        quality=92,
        optimize=True,
        progressive=True,
        subsampling=0,
    )


def generate(case: Case) -> None:
    with Image.open(EXAMPLES / case.background) as opened:
        background = np.asarray(opened.convert("RGB")).copy()
    asset = load_png_layer(EXAMPLES / case.asset)
    options = get_render_preset(case.preset)

    wrong = blend_composite(background, asset, case.wrong_quad, options)
    clean_options = {
        **options,
        "blendMode": "normal",
        "opacity": 1.0,
        "blurPx": 0.0,
        "brightnessMatch": False,
        "tintStrength": 0.0,
        "textureStrength": 0.0,
        "saturation": 1.0,
    }
    correct = blend_composite(background, asset, case.correct_quad, clean_options)
    final = blend_composite(background, asset, case.correct_quad, options)

    guide_bgr = cv2.cvtColor(correct, cv2.COLOR_RGB2BGR)
    _draw_perspective_overlay(
        guide_bgr,
        np.asarray(case.correct_quad, dtype=np.float64),
    )
    guide = cv2.cvtColor(guide_bgr, cv2.COLOR_BGR2RGB)

    target = OUTPUT / case.name
    save_jpeg(target / "01-original.jpg", background)
    save_jpeg(target / "02-wrong-direction.jpg", wrong)
    save_jpeg(target / "03-vanishing-guide.jpg", guide)
    save_jpeg(target / "04-correct-perspective.jpg", correct)
    save_jpeg(target / "05-final-blend.jpg", final)


def main() -> None:
    for case in CASES:
        generate(case)
    print(f"Generated {len(CASES)} real case studies with five states each.")


if __name__ == "__main__":
    main()
