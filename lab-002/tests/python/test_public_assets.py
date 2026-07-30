from __future__ import annotations

import json
from pathlib import Path
import shutil

import pytest

from scripts.generate_technical_figures import _font, generate_figures
from scripts.validate_public_assets import (
    _compare_regenerated_pixels,
    _validate_image,
    validate_public_assets,
    validate_public_figures,
)
from scripts.extract_real_samples import (
    JPEG_QUALITY,
    SOURCES,
    _resolve_source_video,
    _write_jpeg,
)


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


def test_extractor_resolves_each_documented_direct_video_filename(tmp_path: Path) -> None:
    for source in SOURCES:
        exact = tmp_path / source.direct_video_file
        exact.write_bytes(b"real source placeholder")

        assert _resolve_source_video(source, tmp_path) == exact

        exact.unlink()
        alias = tmp_path / source.source_file
        alias.write_bytes(b"real source placeholder")
        assert _resolve_source_video(source, tmp_path) == alias
        alias.unlink()


def test_derivative_contract_records_exact_size_and_encoder_quality() -> None:
    manifest = json.loads((LAB_ROOT / "assets" / "asset-manifest.json").read_text("utf-8"))

    assert JPEG_QUALITY == 90
    for sequence in manifest["sequences"]:
        assert sequence["derivative"] == {
            "width": 1600,
            "height": 900,
            "format": "JPEG",
            "jpegQuality": 90,
        }


def test_validator_rejects_a_1600px_image_with_the_wrong_aspect(tmp_path: Path) -> None:
    from hashlib import sha256

    from PIL import Image

    image_path = tmp_path / "wrong-shape.jpg"
    Image.new("RGB", (1600, 800), "gray").save(image_path, quality=90)
    expected_hash = sha256(image_path.read_bytes()).hexdigest()
    errors: list[str] = []

    _validate_image(image_path, expected_hash, errors)

    assert any("1600x900" in error for error in errors)


def test_real_input_technical_figures_are_complete_and_traceable() -> None:
    assert validate_public_figures(LAB_ROOT) == []

    manifest = json.loads(
        (LAB_ROOT / "docs" / "figures" / "figure-manifest.json").read_text("utf-8")
    )
    expected = [
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
    ]
    assert [figure["id"] for figure in manifest["figures"]] == expected
    assert all(figure["isGeneratedScene"] is False for figure in manifest["figures"])
    assert all(figure["basedOnRealInput"] is True for figure in manifest["figures"])


def test_real_device_media_is_explicitly_pending_without_fake_public_files() -> None:
    status = json.loads(
        (LAB_ROOT / "assets" / "real-device-media-status.json").read_text("utf-8")
    )

    assert status["status"] == "PENDING_DEVICE_CAPTURE"
    assert status["isSimulated"] is False
    assert status["publicFiles"] == []
    assert status["requiredDevices"] == ["Android Chrome", "iPhone Safari"]
    public_media = [
        path
        for path in LAB_ROOT.rglob("*")
        if path.suffix.lower() in {".gif", ".mp4", ".webm"}
    ]
    assert public_media == []


def test_figure_generation_is_repeatable_in_isolated_directories(
    tmp_path: Path,
) -> None:
    from hashlib import sha256

    first = tmp_path / "first"
    second = tmp_path / "second"
    generate_figures(LAB_ROOT, output_dir=first)
    generate_figures(LAB_ROOT, output_dir=second)
    manifest = json.loads(
        (LAB_ROOT / "docs" / "figures" / "figure-manifest.json").read_text("utf-8")
    )

    for figure in manifest["figures"]:
        filename = Path(figure["output"]).name
        first_hash = sha256((first / filename).read_bytes()).hexdigest()
        second_hash = sha256((second / filename).read_bytes()).hexdigest()
        assert first_hash == second_hash
        assert _compare_regenerated_pixels(
            LAB_ROOT / figure["output"],
            first / filename,
        ) == []


def test_cross_platform_figure_comparison_rejects_a_fabricated_image(
    tmp_path: Path,
) -> None:
    from PIL import Image

    canonical = tmp_path / "canonical.png"
    fabricated = tmp_path / "fabricated.png"
    Image.new("RGB", (1080, 720), "#111318").save(canonical)
    Image.new("RGB", (1080, 720), "#334455").save(fabricated)

    errors = _compare_regenerated_pixels(canonical, fabricated)

    assert any("pixels differ beyond cross-platform tolerance" in error for error in errors)


def test_figure_generation_uses_only_bundled_ofl_fonts() -> None:
    from hashlib import sha256

    fonts_root = (LAB_ROOT / "assets" / "fonts").resolve()
    manifest = json.loads((fonts_root / "font-manifest.json").read_text("utf-8"))

    assert manifest["license"] == "SIL Open Font License 1.1"
    assert (fonts_root / "OFL.txt").is_file()
    assert "SIL OPEN FONT LICENSE Version 1.1" in (
        fonts_root / "OFL.txt"
    ).read_text("utf-8")
    for bold, filename in (
        (False, "NotoSansSC-Regular-subset.otf"),
        (True, "NotoSansSC-Bold-subset.otf"),
    ):
        font_path = Path(_font(20, bold=bold).path).resolve()

        assert font_path == fonts_root / filename
        assert sha256(font_path.read_bytes()).hexdigest() == manifest["files"][filename]


def test_validator_rejects_fabricated_png_with_copied_metadata(
    tmp_path: Path,
) -> None:
    from PIL import Image
    from PIL.PngImagePlugin import PngInfo

    sandbox = tmp_path / "lab"
    shutil.copytree(LAB_ROOT / "assets", sandbox / "assets")
    shutil.copytree(LAB_ROOT / "docs" / "figures", sandbox / "docs" / "figures")
    (sandbox / "scripts").mkdir(parents=True)
    shutil.copy2(
        LAB_ROOT / "scripts" / "REAL_DEVICE_CAPTURE.md",
        sandbox / "scripts" / "REAL_DEVICE_CAPTURE.md",
    )
    target = sandbox / "docs" / "figures" / "01-overlap.png"
    with Image.open(target) as original:
        size = original.size
        copied_info = {
            key: value
            for key, value in original.info.items()
            if isinstance(value, str)
        }
    metadata = PngInfo()
    for key, value in copied_info.items():
        metadata.add_text(key, value)
    Image.new("RGB", size, "#334455").save(target, "PNG", pnginfo=metadata)

    errors = validate_public_figures(sandbox)

    assert any("deterministic regeneration" in error for error in errors)
