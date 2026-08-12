"""Validate only the assets that the LAB 004 software is allowed to publish."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    manifest_path = ROOT / "assets" / "samples" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("sourceRepository") != "opencv/opencv":
        raise SystemExit("sample source repository must be opencv/opencv")
    if len(manifest.get("sourceCommit", "")) != 40:
        raise SystemExit("sample source commit must be a full SHA")
    if manifest.get("license") != "Apache-2.0":
        raise SystemExit("sample license must be Apache-2.0")
    board = manifest.get("board", {})
    if board.get("innerCorners") != [9, 6] or board.get("squareSizeM", 0) <= 0:
        raise SystemExit("checkerboard configuration is incomplete")
    for sample in manifest.get("samples", []):
        path = manifest_path.parent / sample["path"]
        if not path.is_file():
            raise SystemExit(f"missing sample: {path}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != sample.get("sha256"):
            raise SystemExit(f"sample SHA-256 mismatch: {path}")
    print(f"LAB 004 public assets: PASS ({len(manifest['samples'])} sample(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
