import numpy as np

from perspective_paste.blending import (
    apply_environment_tint,
    apply_texture,
    blend_composite,
    blend_mode,
    make_shadow,
    match_brightness,
    warp_asset,
)


def rgba(rgb, alpha=255, size=(2, 2)):
    layer = np.empty((*size, 4), dtype=np.uint8)
    layer[..., :3] = rgb
    layer[..., 3] = alpha
    return layer


def test_blend_modes_use_w3c_formulas_and_stay_in_range():
    background = np.array([[[64, 128, 192]]], dtype=np.uint8)
    source = np.array([[[128, 64, 192]]], dtype=np.uint8)

    normal = blend_mode(background, source, "normal")
    multiply = blend_mode(background, source, "multiply")
    soft_light = blend_mode(background, source, "soft-light")

    np.testing.assert_array_equal(normal, source)
    np.testing.assert_allclose(multiply, [[[32, 32, 145]]], atol=1)
    assert soft_light.dtype == np.uint8
    assert np.all((soft_light >= 0) & (soft_light <= 255))


def test_brightness_matching_clamps_gain_at_both_limits():
    dark = rgba((10, 10, 10))
    bright = rgba((250, 250, 250))

    raised, high_gain = match_brightness(bright, dark, return_gain=True)
    lowered, low_gain = match_brightness(dark, bright, return_gain=True)

    assert high_gain == 1.4
    assert low_gain == 0.6
    assert raised[0, 0, 0] == 14
    assert lowered[0, 0, 0] == 150
    np.testing.assert_array_equal(raised[..., 3], dark[..., 3])


def test_environment_tint_uses_masked_background_average():
    background = np.full((2, 2, 3), (200, 100, 50), dtype=np.uint8)
    source = rgba((100, 100, 100))

    tinted = apply_environment_tint(background, source, 0.5)

    np.testing.assert_allclose(tinted[0, 0, :3], (150, 100, 75), atol=1)
    np.testing.assert_array_equal(tinted[..., 3], source[..., 3])


def test_texture_strength_zero_is_exact_no_op():
    rng = np.random.default_rng(3)
    background = rng.integers(0, 256, (12, 13, 3), dtype=np.uint8)
    source = rng.integers(0, 256, (12, 13, 4), dtype=np.uint8)

    result = apply_texture(background, source, texture_strength=0)

    np.testing.assert_array_equal(result, source)


def test_disabled_shadow_is_transparent():
    source = rgba((255, 255, 255), size=(8, 8))
    shadow = make_shadow(source, enabled=False)

    assert shadow.shape == source.shape
    assert not np.any(shadow)


def test_warp_asset_places_rgba_layer_in_quad_on_canvas():
    source = rgba((255, 0, 0), size=(4, 4))
    warped = warp_asset(source, [[2, 2], [7, 2], [7, 7], [2, 7]], (10, 10))

    assert warped.shape == (10, 10, 4)
    assert warped[4, 4, 0] > 240
    assert warped[4, 4, 3] > 240
    assert warped[0, 0, 3] == 0


def test_warp_asset_interpolates_premultiplied_rgba_without_dark_halo():
    source = np.zeros((4, 4, 4), dtype=np.uint8)
    source[:, :2] = (255, 255, 255, 255)
    warped = warp_asset(
        source,
        [[2.3, 2.2], [15.7, 1.8], [16.2, 16.1], [1.8, 15.8]],
        (20, 20),
    )
    transition = warped[(warped[..., 3] > 0) & (warped[..., 3] < 255)]

    assert len(transition) > 0
    assert transition[..., :3].min() >= 250


def test_composite_blur_does_not_square_alpha_into_a_dark_halo():
    background = np.zeros((30, 30, 3), dtype=np.uint8)
    source = np.zeros((8, 8, 4), dtype=np.uint8)
    source[2:6, 2:6] = (255, 255, 255, 255)
    options = {
        "blendMode": "normal",
        "opacity": 1,
        "blurPx": 90,
        "brightnessMatch": False,
        "tintStrength": 0,
        "textureStrength": 0,
        "saturation": 1,
        "shadow": {"enabled": False},
        "fitMode": "fill",
    }

    result = blend_composite(
        background,
        source,
        [[5, 5], [24, 5], [24, 24], [5, 24]],
        options,
    )

    # Correct premultiplied blur retains enough white energy at the soft edge.
    assert result[10, 10, 0] >= 45


def test_composite_normal_mode_honors_source_and_global_opacity():
    background = np.full((10, 10, 3), 100, dtype=np.uint8)
    source = rgba((200, 200, 200), alpha=128, size=(4, 4))
    quad = [[2, 2], [7, 2], [7, 7], [2, 7]]
    options = {
        "blendMode": "normal",
        "opacity": 0.5,
        "blurPx": 0,
        "brightnessMatch": False,
        "tintStrength": 0,
        "textureStrength": 0,
        "saturation": 1,
        "shadow": {"enabled": False},
        "fitMode": "fill",
    }

    result = blend_composite(background, source, quad, options)

    assert result.shape == background.shape
    np.testing.assert_allclose(result[4, 4], (125, 125, 125), atol=2)
    np.testing.assert_array_equal(result[0, 0], background[0, 0])


def test_composite_preserves_background_dimensions_and_rgba_shape():
    background = rgba((40, 50, 60), alpha=220, size=(12, 15))
    source = rgba((100, 130, 160), size=(3, 5))
    result = blend_composite(
        background,
        source,
        [[1, 1], [13, 2], [12, 10], [2, 9]],
        {
            "blendMode": "soft-light",
            "opacity": 1,
            "blurPx": 1,
            "brightnessMatch": True,
            "tintStrength": 0.15,
            "textureStrength": 0.2,
            "saturation": 0.8,
            "shadow": {
                "enabled": True,
                "offsetX": 1,
                "offsetY": 1,
                "blur": 1,
                "opacity": 0.25,
            },
            "fitMode": "contain",
        },
    )

    assert result.shape == background.shape
    assert result.dtype == np.uint8
