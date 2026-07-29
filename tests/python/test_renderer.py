import os
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from perspective_paste.renderer import (
    crop_transparent,
    find_system_fonts,
    fit_asset,
    font_supports_text,
    load_png_layer,
    premultiply_alpha,
    render_text_layer,
    resolve_font,
    unpremultiply_alpha,
)


def test_font_discovery_and_invalid_explicit_path_are_actionable(tmp_path):
    fonts = find_system_fonts()
    assert fonts
    assert all(Path(path).is_file() for path in fonts)

    with pytest.raises(FileNotFoundError) as caught:
        resolve_font(tmp_path / "missing.ttf")
    message = str(caught.value)
    assert "Microsoft YaHei" in message
    assert "PingFang SC" in message
    assert "Noto Sans CJK" in message
    assert "DejaVu Sans" in message


@pytest.mark.parametrize(("text", "vertical"), [("Perspective", False), ("先贴得准", True)])
def test_render_text_layer_has_nonempty_alpha_for_english_and_chinese(text, vertical):
    layer = render_text_layer(
        text,
        font_size=42,
        color=(12, 34, 56),
        opacity=0.5,
        stroke_width=1,
        stroke_fill=(255, 255, 255),
        letter_spacing=3,
        line_spacing=5,
        vertical=vertical,
    )

    assert layer.dtype == np.uint8
    assert layer.ndim == 3 and layer.shape[2] == 4
    assert np.any(layer[..., 3] > 0)
    assert layer[..., 3].max() <= 128


def test_load_png_layer_adds_opaque_alpha(tmp_path):
    path = tmp_path / "rgb.png"
    Image.new("RGB", (7, 5), (10, 20, 30)).save(path)

    layer = load_png_layer(path)

    assert layer.shape == (5, 7, 4)
    assert np.all(layer[..., :3] == (10, 20, 30))
    assert np.all(layer[..., 3] == 255)


def test_load_png_layer_accepts_array_and_pil():
    gray = np.full((3, 4), 17, dtype=np.uint8)
    assert load_png_layer(gray).shape == (3, 4, 4)
    assert load_png_layer(Image.fromarray(gray)).shape == (3, 4, 4)


def test_crop_transparent_returns_tight_bounds_and_preserves_empty_layer():
    layer = np.zeros((8, 9, 4), dtype=np.uint8)
    layer[2:6, 3:7] = (1, 2, 3, 255)
    np.testing.assert_array_equal(crop_transparent(layer), layer[2:6, 3:7])

    empty = np.zeros((4, 5, 4), dtype=np.uint8)
    assert crop_transparent(empty).shape == empty.shape


def test_fit_asset_fill_crops_and_contain_letterboxes():
    wide = np.zeros((2, 4, 4), dtype=np.uint8)
    wide[:, :2] = (255, 0, 0, 255)
    wide[:, 2:] = (0, 0, 255, 255)

    filled = fit_asset(wide, (2, 2), "fill")
    contained = fit_asset(wide, (4, 4), "contain")

    assert filled.shape == (2, 2, 4)
    assert np.all(filled[..., 3] == 255)
    assert contained.shape == (4, 4, 4)
    assert np.all(contained[:1, ..., 3] == 0)
    assert np.all(contained[1:3, ..., 3] == 255)
    assert np.all(contained[3:, ..., 3] == 0)


def test_fit_asset_rejects_unknown_mode():
    with pytest.raises(ValueError, match="fill or contain"):
        fit_asset(np.zeros((2, 2, 4), dtype=np.uint8), (4, 4), "stretch")


def test_premultiply_round_trip_preserves_visible_color_and_zeros_hidden_rgb():
    layer = np.array([[[255, 255, 255, 128], [99, 88, 77, 0]]], dtype=np.uint8)

    restored = unpremultiply_alpha(premultiply_alpha(layer))

    np.testing.assert_allclose(restored[0, 0], layer[0, 0], atol=1)
    np.testing.assert_array_equal(restored[0, 1], (0, 0, 0, 0))


def test_fit_asset_resizes_rgba_without_dark_transparent_edge_halo():
    layer = np.zeros((2, 2, 4), dtype=np.uint8)
    layer[:, 0] = (255, 255, 255, 255)

    resized = fit_asset(layer, (16, 16), "fill")
    transition = resized[(resized[..., 3] > 0) & (resized[..., 3] < 255)]

    assert len(transition) > 0
    assert transition[..., :3].min() >= 250


def test_ascii_only_font_is_allowed_for_ascii_but_rejected_for_chinese():
    fonts = find_system_fonts()
    ascii_only = next(
        (path for path in fonts if "dejavu" in path.name.lower()), None
    )
    if ascii_only is None:
        arial = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "arial.ttf"
        if not arial.is_file():
            pytest.skip("No known ASCII-only test font is installed")
        ascii_only = arial
    assert font_supports_text(ascii_only, "Perspective 123")
    assert not font_supports_text(ascii_only, "中文")

    ascii_layer = render_text_layer("ASCII", font_path=ascii_only, font_size=24)
    assert np.any(ascii_layer[..., 3])
    with pytest.raises(ValueError) as caught:
        render_text_layer("中文", font_path=ascii_only, font_size=24)
    message = str(caught.value)
    assert "does not cover" in message
    assert "Microsoft YaHei" in message
    assert "Noto Sans CJK" in message
