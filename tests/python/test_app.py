from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import perspective_paste
from perspective_paste.app import (
    DEFAULT_TEXT,
    build_parser,
    can_export,
    cycle_blur,
    downsample_preview,
    export_composite,
    export_composite_safely,
    export_image,
)
from perspective_paste.interaction import InteractionState


def test_parser_defaults_to_sample_wall_and_chinese_text():
    arguments = build_parser().parse_args([])

    assert arguments.background.as_posix().endswith("assets/examples/wall.jpg")
    assert arguments.text == DEFAULT_TEXT == "先贴得准，再融得真"
    assert arguments.asset is None
    assert arguments.preset == "wall"


def test_parser_supports_asset_and_rejects_text_asset_combination(tmp_path):
    parser = build_parser()
    arguments = parser.parse_args(
        [
            "--background",
            str(tmp_path / "background.png"),
            "--asset",
            str(tmp_path / "logo.png"),
            "--preset",
            "screen",
            "--output",
            str(tmp_path / "result.jpg"),
        ]
    )
    assert arguments.asset == tmp_path / "logo.png"
    assert arguments.output == tmp_path / "result.jpg"

    with pytest.raises(SystemExit):
        parser.parse_args(["--text", "x", "--asset", "asset.png"])


def test_downsample_preview_caps_long_edge_without_changing_aspect():
    source = np.zeros((1000, 2000, 3), dtype=np.uint8)

    preview, scale = downsample_preview(source, max_edge=1200)

    assert preview.shape == (600, 1200, 3)
    assert scale == 0.6
    original, original_scale = downsample_preview(source, max_edge=2400)
    assert original.shape == source.shape
    assert original_scale == 1.0


def test_cycle_blur_uses_the_documented_six_step_sequence():
    values = [0.0]
    for _ in range(6):
        values.append(cycle_blur(values[-1]))
    assert values == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 0.0]
    assert cycle_blur(0.7) == 1.0


@pytest.mark.parametrize("suffix", [".png", ".jpg", ".jpeg"])
def test_export_image_preserves_dimensions(tmp_path, suffix):
    image = np.zeros((17, 23, 4), dtype=np.uint8)
    image[..., :3] = (10, 20, 30)
    image[..., 3] = 255
    output = tmp_path / f"export{suffix}"

    returned = export_image(image, output)

    assert returned == output
    with Image.open(output) as loaded:
        assert loaded.size == (23, 17)
        assert loaded.format == ("PNG" if suffix == ".png" else "JPEG")


def test_export_jpeg_uses_quality_92(monkeypatch, tmp_path):
    captured = {}

    def fake_save(self, path, **options):
        captured.update(options)

    monkeypatch.setattr(Image.Image, "save", fake_save)
    export_image(np.zeros((2, 3, 3), dtype=np.uint8), tmp_path / "result.jpg")

    assert captured["quality"] == 92


def test_top_level_package_exports_geometry_renderer_and_blending_apis():
    for name in (
        "validate_quad",
        "render_text_layer",
        "load_png_layer",
        "blend_mode",
        "warp_asset",
        "blend_composite",
    ):
        assert callable(getattr(perspective_paste, name))


def test_invalid_current_quad_keeps_preview_fallback_but_refuses_export(tmp_path):
    state = InteractionState(
        100,
        100,
        points=[(10, 10), (90, 10), (90, 90), (10, 90)],
    )
    fallback = state.last_valid_quad.copy()
    assert can_export(state)

    state.select_nearest((90, 10))
    state.drag_selected((10, 10))

    np.testing.assert_array_equal(state.last_valid_quad, fallback)
    assert state.error_code == "DUPLICATE_POINTS"
    assert not can_export(state)
    with pytest.raises(ValueError, match="valid current quadrilateral"):
        export_composite(
            np.zeros((100, 100, 3), dtype=np.uint8),
            np.full((10, 10, 4), 255, dtype=np.uint8),
            state,
            1.0,
            {
                "blendMode": "normal",
                "opacity": 1,
                "blurPx": 0,
                "brightnessMatch": False,
                "tintStrength": 0,
                "textureStrength": 0,
                "saturation": 1,
                "shadow": {"enabled": False},
                "fitMode": "fill",
            },
            tmp_path / "must-not-exist.png",
        )
    assert not (tmp_path / "must-not-exist.png").exists()


def test_export_composite_safely_reports_target_and_system_error(tmp_path):
    state = InteractionState(
        100,
        100,
        points=[(10, 10), (90, 10), (90, 90), (10, 90)],
    )
    output = tmp_path / "result.unsupported"
    status = export_composite_safely(
        np.zeros((100, 100, 3), dtype=np.uint8),
        np.full((10, 10, 4), 255, dtype=np.uint8),
        state,
        1.0,
        {
            "blendMode": "normal",
            "opacity": 1,
            "blurPx": 0,
            "brightnessMatch": False,
            "tintStrength": 0,
            "textureStrength": 0,
            "saturation": 1,
            "shadow": {"enabled": False},
            "fitMode": "fill",
        },
        output,
    )
    assert str(output) in status
    assert "Export failed" in status
    assert "output extension" in status
