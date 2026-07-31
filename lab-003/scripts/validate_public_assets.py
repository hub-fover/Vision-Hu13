from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    manifest = json.loads((ROOT / "assets" / "asset-manifest.json").read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in manifest["assets"]}
    expected = {
        "peyrou-under": ROOT / "assets" / "sources" / "peyrou" / "under.jpg",
        "peyrou-mean": ROOT / "assets" / "sources" / "peyrou" / "mean.jpg",
        "peyrou-over": ROOT / "assets" / "sources" / "peyrou" / "over.jpg",
        "kebun-3": ROOT / "assets" / "sources" / "kebun" / "3.jpg",
        "kebun-6": ROOT / "assets" / "sources" / "kebun" / "6.jpg",
        "kebun-9": ROOT / "assets" / "sources" / "kebun" / "9.jpg",
        "mobil-1": ROOT / "assets" / "sources" / "mobil" / "1.JPG",
        "mobil-4": ROOT / "assets" / "sources" / "mobil" / "4.JPG",
        "mobil-10": ROOT / "assets" / "sources" / "mobil" / "10.JPG",
    }
    for identifier, path in expected.items():
        assert path.is_file(), path
        assert digest(path) == by_id[identifier]["sha256"]
        assert by_id[identifier]["license"] == "MIT"
        expected_commit = "ad19046ddfd266b431a45276c366fe03e107e3cd" if identifier.startswith("peyrou") else "72d64014a27c88aeadff91e3e8255321c316eb37"
        assert by_id[identifier]["commit"] == expected_commit
        with Image.open(path) as image:
            image.verify()
    license_text = (ROOT / "assets" / "sources" / "peyrou" / "LICENSE").read_text(encoding="utf-8")
    assert "MIT License" in license_text and "Permission is hereby granted" in license_text
    nightmode_license = (ROOT / "assets" / "sources" / "nightmode-LICENSE").read_text(encoding="utf-8")
    assert "MIT License" in nightmode_license and "Permission is hereby granted" in nightmode_license
    figures = sorted((ROOT / "assets" / "figures").glob("*.jpg"))
    assert len(figures) == 10
    for path in figures:
        assert path.stat().st_size > 40_000, path
    for name in ("cover.jpg", "share.jpg", "static-comparison.jpg", "lab-003-browser-demo.webm"):
        path = ROOT / "assets" / "public" / name
        assert path.is_file() and path.stat().st_size > 50_000, path
    metadata = json.loads((ROOT / "assets" / "public" / "demo-metadata.json").read_text(encoding="utf-8"))
    assert metadata["kind"] == "real-browser-recording"
    assert "not presented as a physical-device" in metadata["disclaimer"]
    print(f"LAB 003 public assets: PASS ({len(figures)} figures, {len(expected)} pinned sources)")


if __name__ == "__main__":
    main()
