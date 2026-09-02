"""Validate only the assets that the LAB 004 software is allowed to publish."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    manifest_path = ROOT / "assets" / "samples" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != "lab004.static-scene-speed-samples.v2":
        raise SystemExit("static scene speed sample schema is missing")
    if not manifest.get("sampleId") or manifest.get("license") != "MIT":
        raise SystemExit("deterministic sample metadata is incomplete")
    if manifest.get("frameCount", 0) < 2 or manifest.get("fps", 0) <= 0:
        raise SystemExit("sample frame metadata is invalid")
    if not isinstance(manifest.get("groundTruthVelocityMps"), (int, float)) or manifest["groundTruthVelocityMps"] <= 0:
        raise SystemExit("sample ground truth is incomplete")
    if not isinstance(manifest.get("groundTruthDirectionDeg"), (int, float)):
        raise SystemExit("sample direction ground truth is incomplete")
    reference = manifest.get("scaleReference", {})
    if not reference.get("p1Px") or not reference.get("p2Px") or reference.get("realDistanceM", 0) <= 0:
        raise SystemExit("sample scale reference is incomplete")
    if not manifest.get("samples") or "gifSamples" in manifest or "videoSamples" in manifest:
        raise SystemExit("only deterministic static-scene sample assets may be published")
    for sample in manifest.get("samples", []):
        path = manifest_path.parent / sample["path"]
        if not path.is_file():
            raise SystemExit(f"missing sample: {path}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != sample.get("sha256"):
            raise SystemExit(f"sample SHA-256 mismatch: {path}")
    print(f"LAB 004 public assets: PASS ({manifest['sampleId']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
