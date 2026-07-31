"""Command-line interface for LAB 003."""

from __future__ import annotations

import argparse
from importlib import resources
from pathlib import Path
import sys
from typing import Sequence

from PIL import Image

from .contracts import FusionOptions
from .errors import FusionError
from .fusion import fuse_exposures
from .io import SUPPORTED_EXTENSIONS


DEFAULT_SAMPLE_RELATIVE_DIRECTORY = Path("samples") / "peyrou"


def default_sample_directory():
    return resources.files("exposure_fusion").joinpath(*DEFAULT_SAMPLE_RELATIVE_DIRECTORY.parts)


def discover_default_samples(directory=None):
    root = default_sample_directory() if directory is None else Path(directory)
    if not root.is_dir():
        raise FusionError("DECODE_FAILED", "The packaged Peyrou sample is missing.")
    paths = tuple(
        sorted(
            (item for item in root.iterdir() if item.is_file() and Path(item.name).suffix.lower() in SUPPORTED_EXTENSIONS),
            key=lambda item: item.name.casefold(),
        )
    )
    if len(paths) != 3:
        raise FusionError("INVALID_IMAGE_COUNT", "The packaged sample must contain exactly three exposures.")
    return paths


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m exposure_fusion",
        description="Fuse exactly three JPEG/PNG/WebP exposures locally.",
    )
    parser.add_argument("images", nargs="*", help="dark, normal, and bright exposures in any order")
    parser.add_argument("--output", type=Path, default=Path("fusion.jpg"))
    parser.add_argument("--debug-dir", type=Path)
    parser.add_argument("--no-motion-protection", action="store_true")
    return parser


def exit_code_for_error(error: FusionError) -> int:
    return 130 if error.code == "CANCELLED" else 2


def cli_main(argv: Sequence[str] | None = None, *, default_sample_dir=None) -> int:
    arguments = build_parser().parse_args(argv)
    options = FusionOptions(motion_protection=not arguments.no_motion_protection)
    try:
        sources = tuple(arguments.images) if arguments.images else discover_default_samples(default_sample_dir)
        result = fuse_exposures(sources, options=options, debug_dir=arguments.debug_dir)
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(result.image).save(
            arguments.output,
            "JPEG",
            quality=round(options.jpeg_quality * 100),
        )
    except FusionError as error:
        print(error, file=sys.stderr)
        return exit_code_for_error(error)
    print(arguments.output)
    return 0
