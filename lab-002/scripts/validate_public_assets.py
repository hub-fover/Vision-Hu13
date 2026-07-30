"""Validate that LAB 002 samples are authentic, local Pexels derivatives."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image

try:
    from scripts.extract_real_samples import JPEG_QUALITY
except ModuleNotFoundError:  # Direct `python scripts/validate_public_assets.py`.
    from extract_real_samples import JPEG_QUALITY


EXPECTED = {
    "mountains": {
        "creator": "cottonbro studio",
        "videoId": "9943097",
        "fractions": [0.30, 0.45, 0.60],
        "count": 3,
    },
    "city": {
        "creator": "Zulfugar Karimov",
        "videoId": "36722864",
        "fractions": [0.20, 0.35, 0.50, 0.65],
        "count": 4,
    },
    "ocean": {
        "creator": "James Cheney",
        "videoId": "6746361",
        "fractions": [0.30, 0.45, 0.60],
        "count": 3,
    },
}

FIGURE_IDS = (
    "overlap",
    "orb",
    "candidate-matches",
    "ratio-filter",
    "ransac",
    "transformed-canvas",
    "middle-anchor",
    "exposure",
    "feather",
    "failure-boundaries",
)
REAL_INPUT_LABEL = "基于真实输入的算法标注"


def _load_json(path: Path, errors: list[str]) -> dict[str, Any]:
    if not path.is_file():
        errors.append(f"missing JSON: {path.relative_to(path.parents[1])}")
        return {}
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"invalid JSON {path.name}: {exc}")
        return {}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_image(path: Path, expected_hash: str, errors: list[str]) -> str | None:
    if not path.is_file():
        errors.append(f"missing sample: {path.as_posix()}")
        return None
    try:
        with Image.open(path) as image:
            image.load()
            if image.format != "JPEG":
                errors.append(f"sample is not JPEG: {path.as_posix()}")
            if image.size != (1600, 900):
                errors.append(
                    f"sample must be exactly 1600x900: {path.as_posix()} is {image.size}"
                )
    except (OSError, ValueError) as exc:
        errors.append(f"sample cannot be decoded: {path.as_posix()}: {exc}")
        return None
    actual_hash = _sha256(path)
    if actual_hash != expected_hash:
        errors.append(f"sample checksum mismatch: {path.as_posix()}")
    return actual_hash


def validate_public_assets(lab_root: Path) -> list[str]:
    """Return all provenance/publication errors without mutating the repository."""

    lab_root = Path(lab_root).resolve()
    errors: list[str] = []
    manifest = _load_json(lab_root / "assets" / "asset-manifest.json", errors)
    web_manifest = _load_json(
        lab_root / "web" / "assets" / "samples" / "manifest.json", errors
    )
    sources_path = lab_root / "assets" / "SOURCES.md"
    if not sources_path.is_file():
        errors.append("missing assets/SOURCES.md")

    sequences = {
        sequence.get("id"): sequence
        for sequence in manifest.get("sequences", [])
        if isinstance(sequence, dict)
    }
    if set(sequences) != set(EXPECTED):
        errors.append("asset manifest must contain exactly mountains, city and ocean")

    for sequence_id, contract in EXPECTED.items():
        sequence = sequences.get(sequence_id, {})
        for key, expected in (
            ("creator", contract["creator"]),
            ("videoId", contract["videoId"]),
            ("downloadedAt", "2026-07-29"),
            ("license", "Pexels License"),
            ("isGenerated", False),
            ("isThirdParty", True),
        ):
            if sequence.get(key) != expected:
                errors.append(f"{sequence_id}.{key} must be {expected!r}")
        if not str(sequence.get("sourceUrl", "")).startswith("https://www.pexels.com/"):
            errors.append(f"{sequence_id}.sourceUrl must be a Pexels work page")
        if not str(sequence.get("directVideoUrl", "")).startswith(
            "https://videos.pexels.com/video-files/"
        ):
            errors.append(f"{sequence_id}.directVideoUrl must record the exact file")
        if not sequence.get("transformations"):
            errors.append(f"{sequence_id}.transformations must be documented")
        derivative = sequence.get("derivative")
        expected_derivative = {
            "width": 1600,
            "height": 900,
            "format": "JPEG",
            "jpegQuality": JPEG_QUALITY,
        }
        if derivative != expected_derivative:
            errors.append(
                f"{sequence_id}.derivative must be {expected_derivative!r}"
            )

        frames = sequence.get("frames", [])
        if len(frames) != contract["count"]:
            errors.append(f"{sequence_id} must contain {contract['count']} frames")
            continue
        hashes: list[str] = []
        for index, (frame, fraction) in enumerate(
            zip(frames, contract["fractions"], strict=True), start=1
        ):
            if frame.get("fraction") != fraction:
                errors.append(f"{sequence_id} frame {index} has wrong fraction")
            if not isinstance(frame.get("seconds"), (int, float)) or frame["seconds"] <= 0:
                errors.append(f"{sequence_id} frame {index} needs a positive timestamp")
            expected_hash = str(frame.get("sha256", ""))
            local_files = frame.get("localFiles", [])
            if not expected_hash or not local_files:
                errors.append(f"{sequence_id} frame {index} lacks checksum/local files")
                continue
            local_hashes = []
            for relative in local_files:
                candidate = (lab_root / relative).resolve()
                try:
                    candidate.relative_to(lab_root)
                except ValueError:
                    errors.append(f"sample escapes lab root: {relative}")
                    continue
                actual = _validate_image(candidate, expected_hash, errors)
                if actual:
                    local_hashes.append(actual)
            if local_hashes and len(set(local_hashes)) != 1:
                errors.append(f"{sequence_id} frame {index} copies differ")
            hashes.append(expected_hash)
        if len(set(hashes)) != len(hashes):
            errors.append(f"{sequence_id} frames must be distinct video frames")

    web_sequences = web_manifest.get("sequences", {})
    if set(web_sequences) != set(EXPECTED):
        errors.append("web sample manifest must expose all three real sequences")
    for sequence_id, sequence in web_sequences.items():
        if sequence.get("isGenerated") is not False:
            errors.append(f"web {sequence_id} must say isGenerated=false")
        if sequence.get("isThirdParty") is not True:
            errors.append(f"web {sequence_id} must say isThirdParty=true")
        for relative in sequence.get("files", []):
            candidate = (
                lab_root / "web" / "assets" / "samples" / relative
            ).resolve()
            try:
                candidate.relative_to(lab_root / "web" / "assets" / "samples")
            except ValueError:
                errors.append(f"web sample escapes sample root: {relative}")
            if not candidate.is_file():
                errors.append(f"web manifest points to missing sample: {relative}")

    source_videos = list(lab_root.rglob("*.mp4"))
    if source_videos:
        errors.append("source/public MP4 files must not be committed")
    return errors


def validate_public_figures(lab_root: Path) -> list[str]:
    """Validate real-input technical figures and honest device-media status."""

    lab_root = Path(lab_root).resolve()
    errors: list[str] = []
    figures_root = lab_root / "docs" / "figures"
    manifest = _load_json(figures_root / "figure-manifest.json", errors)
    figures = manifest.get("figures", [])
    if [figure.get("id") for figure in figures] != list(FIGURE_IDS):
        errors.append("figure manifest must contain the required 10 figures in order")

    asset_manifest = _load_json(
        lab_root / "assets" / "asset-manifest.json", errors
    )
    published_sample_hashes = {
        relative: frame.get("sha256")
        for sequence in asset_manifest.get("sequences", [])
        for frame in sequence.get("frames", [])
        for relative in frame.get("localFiles", [])
        if relative.startswith("assets/samples/")
    }
    seen_outputs: set[str] = set()
    for number, figure in enumerate(figures, start=1):
        figure_id = figure.get("id", f"figure-{number}")
        if figure.get("number") != number:
            errors.append(f"{figure_id}.number must be {number}")
        if figure.get("basedOnRealInput") is not True:
            errors.append(f"{figure_id} must say basedOnRealInput=true")
        if figure.get("isGeneratedScene") is not False:
            errors.append(f"{figure_id} must say isGeneratedScene=false")
        if figure.get("annotationLabel") != REAL_INPUT_LABEL:
            errors.append(f"{figure_id} lacks the required annotation label")
        credit = str(figure.get("credit", ""))
        if (
            figure.get("license") != "Pexels License"
            or "Pexels License" not in credit
            or not figure.get("creator")
            or figure.get("creator") not in credit
        ):
            errors.append(f"{figure_id} lacks a nearby creator/Pexels credit")
        if not str(figure.get("sourceUrl", "")).startswith(
            "https://www.pexels.com/"
        ):
            errors.append(f"{figure_id} lacks a Pexels work-page URL")

        output_relative = str(figure.get("output", ""))
        if output_relative in seen_outputs:
            errors.append(f"duplicate figure output: {output_relative}")
        seen_outputs.add(output_relative)
        output = (lab_root / output_relative).resolve()
        try:
            output.relative_to(figures_root)
        except ValueError:
            errors.append(f"{figure_id} output escapes docs/figures")
            continue
        if not output.is_file():
            errors.append(f"missing figure output: {output_relative}")
        else:
            try:
                with Image.open(output) as image:
                    image.load()
                    if image.format != "PNG" or image.width != 1080:
                        errors.append(
                            f"{figure_id} must be a 1080px-wide PNG"
                        )
                    info = image.info
                    if info.get("annotationLabel") != REAL_INPUT_LABEL:
                        errors.append(
                            f"{figure_id} PNG metadata lacks the real-input label"
                        )
                    if info.get("credit") != credit:
                        errors.append(f"{figure_id} PNG metadata credit differs")
                    if info.get("generator") != "scripts/generate_technical_figures.py":
                        errors.append(f"{figure_id} lacks deterministic generator metadata")
            except (OSError, ValueError) as exc:
                errors.append(f"cannot decode figure {output_relative}: {exc}")

        base_files = figure.get("baseFiles", [])
        if not base_files:
            errors.append(f"{figure_id} must list real base files")
        for relative in base_files:
            if relative not in published_sample_hashes:
                errors.append(
                    f"{figure_id} base is not a tracked real sample: {relative}"
                )
            if not (lab_root / relative).is_file():
                errors.append(f"{figure_id} base is missing: {relative}")

        definition_relative = str(figure.get("sourceDefinition", ""))
        definition = _load_json(lab_root / definition_relative, errors)
        if definition.get("id") != figure_id:
            errors.append(f"{figure_id} source definition ID differs")
        if definition.get("baseFiles") != base_files:
            errors.append(f"{figure_id} source definition bases differ")
        recorded_hashes = definition.get("baseSha256", {})
        for relative in base_files:
            if recorded_hashes.get(relative) != published_sample_hashes.get(relative):
                errors.append(f"{figure_id} source hash differs for {relative}")
        if not definition.get("measurements"):
            errors.append(f"{figure_id} lacks real algorithm measurements")

    status = _load_json(
        lab_root / "assets" / "real-device-media-status.json", errors
    )
    if status.get("status") != "PENDING_DEVICE_CAPTURE":
        errors.append("real-device media status must remain PENDING_DEVICE_CAPTURE")
    if status.get("isSimulated") is not False:
        errors.append("real-device media must state isSimulated=false")
    if status.get("publicFiles") != []:
        errors.append("pending real-device media cannot list public files")
    if status.get("requiredDevices") != ["Android Chrome", "iPhone Safari"]:
        errors.append("real-device status must require Android Chrome and iPhone Safari")
    workflow = lab_root / "scripts" / "REAL_DEVICE_CAPTURE.md"
    if not workflow.is_file():
        errors.append("missing exact real-device capture workflow")

    forbidden_media = [
        path
        for path in lab_root.rglob("*")
        if path.is_file() and path.suffix.lower() in {".gif", ".mp4", ".webm"}
    ]
    if forbidden_media:
        errors.append("no GIF/MP4/WebM may be published before real-device capture")
    return errors


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("lab_root", nargs="?", default=Path(__file__).parents[1])
    args = parser.parse_args()
    root = Path(args.lab_root)
    problems = validate_public_assets(root) + validate_public_figures(root)
    if problems:
        raise SystemExit("\n".join(f"- {problem}" for problem in problems))
    print("LAB 002 real-sample provenance: PASS")
