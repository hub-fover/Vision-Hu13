"""Validate that public LAB 005 samples have local provenance and checksums."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    data = path.read_bytes().replace(b"\r\n", b"\n")
    digest.update(data)
    return digest.hexdigest()


def main() -> None:
    errors: list[str] = []
    path = ROOT / "web" / "assets" / "samples" / "manifest.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"invalid sample manifest: {exc}") from exc
    if manifest.get("schema") != "lab005.samples.v1":
        errors.append("manifest schema must be lab005.samples.v1")
    if not manifest.get("license") or not manifest.get("source"):
        errors.append("manifest must record source and license")
    if manifest.get("checksumEncoding") != "utf8-lf":
        errors.append("manifest checksums must use canonical UTF-8 LF bytes")
    frames = manifest.get("frames", [])
    if len(frames) != 5:
        errors.append("manifest must contain exactly five focus frames")
    ids = set()
    for frame in frames:
        frame_id = frame.get("id")
        if not frame_id or frame_id in ids:
            errors.append(f"duplicate/missing frame id: {frame_id}")
        ids.add(frame_id)
        relative = str(frame.get("path", ""))
        candidate = (ROOT / "web" / "assets" / "samples" / relative).resolve()
        try:
            candidate.relative_to(ROOT / "web" / "assets" / "samples")
        except ValueError:
            errors.append(f"sample path escapes assets root: {relative}")
            continue
        if not candidate.is_file():
            errors.append(f"missing sample file: {relative}")
            continue
        expected = str(frame.get("sha256", ""))
        if len(expected) != 64 or sha256(candidate).lower() != expected.lower():
            errors.append(f"checksum mismatch: {relative}")
        if frame.get("focusPosition") not in {"near", "near-mid", "mid", "far-mid", "far"}:
            errors.append(f"invalid focus position: {frame_id}")
    if errors:
        raise SystemExit("\n".join(f"- {error}" for error in errors))
    print("LAB 005 public assets: PASS")


if __name__ == "__main__":
    main()
