"""Command-line entry point for the LAB 002 Python pipeline."""

from __future__ import annotations

import argparse
from importlib import resources
from importlib.resources.abc import Traversable
from pathlib import Path
import sys
from typing import Sequence

from PIL import Image

from .contracts import StitchOptions
from .errors import StitchError
from .io import SUPPORTED_EXTENSIONS
from .pipeline import stitch_images


DEFAULT_SAMPLE_RELATIVE_DIRECTORY = Path("samples") / "mountains"


def default_sample_directory() -> Traversable:
    """Return the installed package resource reserved for real sample frames."""

    return resources.files("panorama_stitch").joinpath(
        *DEFAULT_SAMPLE_RELATIVE_DIRECTORY.parts
    )


def discover_default_samples(
    directory: str | Path | Traversable | None = None,
) -> tuple[Traversable, ...]:
    """Discover the packaged real mountain frames in filename order."""

    if directory is None:
        sample_directory = default_sample_directory()
    elif isinstance(directory, (str, Path)):
        sample_directory = Path(directory)
    else:
        sample_directory = directory
    samples = tuple(
        sorted(
            (
                path
                for path in sample_directory.iterdir()
                if path.is_file()
                and Path(path.name).suffix.lower() in SUPPORTED_EXTENSIONS
            ),
            key=lambda path: path.name.casefold(),
        )
    ) if sample_directory.is_dir() else ()
    if len(samples) < 2:
        raise StitchError(
            "NOT_ENOUGH_IMAGES",
            (
                "The packaged mountain sample is not available; add at least two "
                "licensed real frames under "
                f"panorama_stitch/{DEFAULT_SAMPLE_RELATIVE_DIRECTORY.as_posix()}."
            ),
        )
    return samples


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m panorama_stitch",
        description="Stitch an ordered JPEG/PNG/WebP panorama with adjacent ORB matches.",
    )
    parser.add_argument("images", nargs="*", help="ordered overlapping input images")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("panorama.jpg"),
        help="JPEG output path (default: panorama.jpg)",
    )
    parser.add_argument(
        "--quality",
        choices=("mobile", "hd"),
        default="mobile",
        help="mobile caps output at 12MP; hd caps it at 24MP",
    )
    parser.add_argument(
        "--debug-dir",
        type=Path,
        help="write feature, match, inlier, transform, seam, and exposure diagnostics",
    )
    return parser


def exit_code_for_error(error: StitchError) -> int:
    """Map every shared error to a stable process status."""

    return 130 if error.code == "CANCELLED" else 2


def cli_main(
    argv: Sequence[str] | None = None,
    *,
    default_sample_dir: str | Path | None = None,
) -> int:
    """Run the CLI and return a process status for easy testing."""

    arguments = build_parser().parse_args(argv)
    try:
        sources = (
            tuple(Path(item) for item in arguments.images)
            if arguments.images
            else discover_default_samples(default_sample_dir)
        )
        result = stitch_images(
            sources,
            options=StitchOptions(),
            quality=arguments.quality,
            debug_dir=arguments.debug_dir,
        )
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(result.image).save(
            arguments.output,
            format="JPEG",
            quality=round(StitchOptions().jpeg_quality * 100),
        )
    except StitchError as error:
        print(error, file=sys.stderr)
        return exit_code_for_error(error)
    for warning in result.warnings:
        print(f"warning: {warning}", file=sys.stderr)
    print(arguments.output)
    return 0
