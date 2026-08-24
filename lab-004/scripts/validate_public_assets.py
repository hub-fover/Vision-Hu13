"""Validate only the assets that the LAB 004 software is allowed to publish."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    manifest_path = ROOT / "assets" / "samples" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != "lab004.measurement-samples.v1":
        raise SystemExit("measurement sample schema is missing")
    if not manifest.get("sampleId") or manifest.get("license") != "MIT":
        raise SystemExit("deterministic sample metadata is incomplete")
    frames = manifest.get("frames", {})
    truth = manifest.get("groundTruth", {})
    if frames.get("count", 0) < 128 or frames.get("fps", 0) <= 0:
        raise SystemExit("sample frame metadata is invalid")
    if truth.get("frequencyHz", 0) <= 0 or truth.get("amplitudePx", 0) <= 0:
        raise SystemExit("sample ground truth is incomplete")
    for sample in manifest.get("samples", []):
        path = manifest_path.parent / sample["path"]
        if not path.is_file():
            raise SystemExit(f"missing sample: {path}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != sample.get("sha256"):
            raise SystemExit(f"sample SHA-256 mismatch: {path}")
    for sample in manifest.get("gifSamples", []):
        path = manifest_path.parent / sample["path"]
        if path.suffix.lower() != ".gif" or not path.is_file():
            raise SystemExit(f"missing GIF sample: {path}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != sample.get("sha256"):
            raise SystemExit(f"GIF SHA-256 mismatch: {path}")
        if sample.get("kind") == "real" and not sample.get("license"):
            raise SystemExit(f"real GIF sample is missing license: {path}")
    for sample in manifest.get("videoSamples", []):
        path = manifest_path.parent / sample["path"]
        if path.suffix.lower() not in {".mp4", ".webm", ".mov"} or not path.is_file():
            raise SystemExit(f"missing video sample: {path}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != sample.get("sha256"):
            raise SystemExit(f"video SHA-256 mismatch: {path}")
        if sample.get("kind") == "real" and not sample.get("license"):
            raise SystemExit(f"real video sample is missing license: {path}")
    print(f"LAB 004 public assets: PASS ({manifest['sampleId']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
