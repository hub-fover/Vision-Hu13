from __future__ import annotations

from pathlib import Path

import numpy as np
import panorama_stitch as panorama
import pytest
from PIL import Image


def api(name: str):
    assert hasattr(panorama, name), f"missing public API: {name}"
    return getattr(panorama, name)


def test_stitch_error_accepts_every_contract_code_and_names_the_pair() -> None:
    stitch_error = api("StitchError")

    for code in panorama.ERROR_CODES:
        error = stitch_error(
            code,
            "quality gate failed",
            pair_index=1,
            pair_names=("middle.jpg", "right.jpg"),
        )
        assert error.code == code
        assert "pair 2" in str(error)
        assert "middle.jpg -> right.jpg" in str(error)


def test_stitch_error_rejects_codes_outside_the_shared_contract() -> None:
    stitch_error = api("StitchError")

    with pytest.raises(ValueError, match="unknown panorama error code"):
        stitch_error("MADE_UP", "not portable")


def test_load_image_rejects_an_unsupported_extension(tmp_path: Path) -> None:
    load_image = api("load_image")
    source = tmp_path / "frame.bmp"
    Image.new("RGB", (4, 3), "red").save(source)

    with pytest.raises(Exception) as caught:
        load_image(source)

    assert caught.value.code == "UNSUPPORTED_FORMAT"
    assert "JPEG, PNG, or WebP" in str(caught.value)


def test_load_image_reports_decode_failure_for_corrupt_supported_file(
    tmp_path: Path,
) -> None:
    load_image = api("load_image")
    source = tmp_path / "broken.jpg"
    source.write_bytes(b"this is not a jpeg")

    with pytest.raises(Exception) as caught:
        load_image(source)

    assert caught.value.code == "DECODE_FAILED"
    assert source.name in str(caught.value)


def test_load_image_applies_exif_transpose(tmp_path: Path) -> None:
    load_image = api("load_image")
    source = tmp_path / "portrait.jpg"
    image = Image.new("RGB", (6, 4), "black")
    for x in range(3):
        for y in range(4):
            image.putpixel((x, y), (250, 10, 10))
    exif = Image.Exif()
    exif[274] = 6
    image.save(source, quality=100, exif=exif)

    decoded = load_image(source)

    assert decoded.shape == (6, 4, 3)
    assert decoded[:3, :, 0].mean() > decoded[3:, :, 0].mean()


def test_resize_for_analysis_caps_the_long_side_and_reports_scale() -> None:
    resize_for_analysis = api("resize_for_analysis")
    source = np.zeros((1000, 2000, 3), dtype=np.uint8)

    resized, scale = resize_for_analysis(source, max_side=1280)

    assert resized.shape == (640, 1280, 3)
    assert scale == pytest.approx(0.64)


def test_resize_for_analysis_does_not_enlarge_small_inputs() -> None:
    resize_for_analysis = api("resize_for_analysis")
    source = np.zeros((40, 60, 3), dtype=np.uint8)

    resized, scale = resize_for_analysis(source, max_side=1280)

    assert resized is source
    assert scale == 1.0
