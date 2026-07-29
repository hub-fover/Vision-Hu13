"""Validate that LAB 002 samples are authentic, local Pexels derivatives."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


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
            if max(image.size) != 1600:
                errors.append(
                    f"sample max side must be 1600px: {path.as_posix()} is {image.size}"
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


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("lab_root", nargs="?", default=Path(__file__).parents[1])
    args = parser.parse_args()
    problems = validate_public_assets(Path(args.lab_root))
    if problems:
        raise SystemExit("\n".join(f"- {problem}" for problem in problems))
    print("LAB 002 real-sample provenance: PASS")
