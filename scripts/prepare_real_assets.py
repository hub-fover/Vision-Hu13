"""Prepare licensed real-scene demo backgrounds from locally downloaded originals."""

from __future__ import annotations

import argparse
import shutil
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = (
    ROOT / "assets" / "examples",
    ROOT / "web" / "assets" / "examples",
)


@dataclass(frozen=True)
class PhotoSpec:
    expected_size: tuple[int, int]
    crop: tuple[int, int, int, int]


PHOTO_SPECS = {
    "wall.jpg": PhotoSpec((5083, 3387), (0, 0, 4516, 3387)),
    "packaging.jpg": PhotoSpec((3000, 2000), (167, 0, 2833, 2000)),
    "screen.jpg": PhotoSpec((5999, 4000), (1100, 700, 4300, 3100)),
}


def prepare(source: Path, destination_name: str) -> None:
    spec = PHOTO_SPECS[destination_name]
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
    if image.size != spec.expected_size:
        raise ValueError(
            f"{source} has size {image.size}; expected {spec.expected_size}"
        )
    image = image.crop(spec.crop).resize((1600, 1200), Image.Resampling.LANCZOS)
    image = ImageEnhance.Contrast(image).enhance(1.02)
    image = ImageEnhance.Color(image).enhance(1.03)
    primary = OUTPUTS[0] / destination_name
    primary.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        primary,
        "JPEG",
        quality=90,
        optimize=True,
        progressive=True,
        subsampling=0,
    )
    for output in OUTPUTS[1:]:
        output.mkdir(parents=True, exist_ok=True)
        shutil.copy2(primary, output / destination_name)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Crop and resize the three credited Pexels source photographs."
    )
    parser.add_argument("--wall", required=True, type=Path)
    parser.add_argument("--packaging", required=True, type=Path)
    parser.add_argument("--screen", required=True, type=Path)
    return parser


def main() -> None:
    arguments = build_parser().parse_args()
    prepare(arguments.wall, "wall.jpg")
    prepare(arguments.packaging, "packaging.jpg")
    prepare(arguments.screen, "screen.jpg")
    print("Prepared wall.jpg, packaging.jpg, and screen.jpg at 1600x1200.")


if __name__ == "__main__":
    main()
