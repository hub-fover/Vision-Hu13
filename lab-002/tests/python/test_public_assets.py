from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.validate_public_assets import validate_public_assets
from scripts.extract_real_samples import _write_jpeg


LAB_ROOT = Path(__file__).resolve().parents[2]


def test_public_asset_validator_accepts_complete_real_media_release() -> None:
    errors = validate_public_assets(LAB_ROOT)

    assert errors == []


def test_manifest_records_exact_licensed_video_derivations() -> None:
    manifest = json.loads((LAB_ROOT / "assets" / "asset-manifest.json").read_text("utf-8"))
    expected = {
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

    sequences = {entry["id"]: entry for entry in manifest["sequences"]}
    assert set(sequences) == set(expected)
    for sequence_id, contract in expected.items():
        sequence = sequences[sequence_id]
        assert sequence["creator"] == contract["creator"]
        assert sequence["videoId"] == contract["videoId"]
        assert sequence["downloadedAt"] == "2026-07-29"
        assert sequence["license"] == "Pexels License"
        assert sequence["isGenerated"] is False
        assert sequence["isThirdParty"] is True
        assert len(sequence["frames"]) == contract["count"]
        assert [frame["fraction"] for frame in sequence["frames"]] == pytest.approx(
            contract["fractions"]
        )
        assert all(frame["seconds"] > 0 for frame in sequence["frames"])
        assert all(frame["localFiles"] for frame in sequence["frames"])


def test_no_source_video_is_published_in_the_repository() -> None:
    assert list(LAB_ROOT.rglob("*.mp4")) == []


def test_extractor_writes_jpeg_inside_unicode_workspace(tmp_path: Path) -> None:
    import numpy as np
    from PIL import Image

    output = tmp_path / "公众号" / "真实山景.jpg"
    pixels = np.full((12, 20, 3), 127, dtype=np.uint8)

    _write_jpeg(output, pixels)

    with Image.open(output) as image:
        assert image.format == "JPEG"
        assert image.size == (20, 12)
