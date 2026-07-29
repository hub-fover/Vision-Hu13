from perspective_paste import config


def test_shared_geometry_preset_is_loaded_into_a_dataclass():
    preset = config.GEOMETRY_PRESET

    assert preset.minimum_point_distance_pixels == 4
    assert preset.maximum_normalized_homography_condition == 100_000_000
    assert config.PRESETS["geometry"]["minimumAreaPixelsSquared"] == 256


EXPECTED_RENDER_PRESETS = {
    "court": {
        "blendMode": "normal",
        "opacity": 0.72,
        "blurPx": 0.6,
        "brightnessMatch": True,
        "tintStrength": 0.12,
        "textureStrength": 0.38,
        "saturation": 0.95,
        "shadow": {
            "enabled": False,
            "offsetX": 0,
            "offsetY": 0,
            "blur": 0,
            "opacity": 0,
        },
        "fitMode": "fill",
    },
    "facade": {
        "blendMode": "multiply",
        "opacity": 0.86,
        "blurPx": 0.5,
        "brightnessMatch": True,
        "tintStrength": 0.15,
        "textureStrength": 0.25,
        "saturation": 0.95,
        "shadow": {
            "enabled": False,
            "offsetX": 0,
            "offsetY": 0,
            "blur": 0,
            "opacity": 0,
        },
        "fitMode": "fill",
    },
    "wall": {
        "blendMode": "multiply",
        "opacity": 0.78,
        "blurPx": 0.7,
        "brightnessMatch": True,
        "tintStrength": 0.18,
        "textureStrength": 0.35,
        "saturation": 1.0,
        "shadow": {
            "enabled": False,
            "offsetX": 0,
            "offsetY": 0,
            "blur": 0,
            "opacity": 0,
        },
        "fitMode": "fill",
    },
    "poster": {
        "blendMode": "normal",
        "opacity": 0.95,
        "blurPx": 0.8,
        "brightnessMatch": True,
        "tintStrength": 0.12,
        "textureStrength": 0.12,
        "saturation": 1.0,
        "shadow": {
            "enabled": True,
            "offsetX": 6,
            "offsetY": 8,
            "blur": 12,
            "opacity": 0.22,
        },
        "fitMode": "fill",
    },
    "packaging": {
        "blendMode": "multiply",
        "opacity": 0.85,
        "blurPx": 0.4,
        "brightnessMatch": True,
        "tintStrength": 0.15,
        "textureStrength": 0.25,
        "saturation": 1.0,
        "shadow": {
            "enabled": False,
            "offsetX": 0,
            "offsetY": 0,
            "blur": 0,
            "opacity": 0,
        },
        "fitMode": "fill",
    },
    "screen": {
        "blendMode": "normal",
        "opacity": 1.0,
        "blurPx": 0.2,
        "brightnessMatch": False,
        "tintStrength": 0.08,
        "textureStrength": 0.0,
        "saturation": 1.1,
        "shadow": {
            "enabled": False,
            "offsetX": 0,
            "offsetY": 0,
            "blur": 0,
            "opacity": 0,
        },
        "fitMode": "fill",
    },
}


def test_shared_render_presets_have_exact_approved_values():
    assert config.PRESETS["presets"] == EXPECTED_RENDER_PRESETS


def test_render_preset_dataclasses_round_trip_to_independent_option_dicts():
    assert set(config.RENDER_PRESETS) == set(EXPECTED_RENDER_PRESETS)
    wall = config.RENDER_PRESETS["wall"]
    assert wall.blend_mode == "multiply"
    assert wall.shadow.enabled is False

    first = config.get_render_preset("poster")
    second = config.get_render_preset("poster")
    assert first == EXPECTED_RENDER_PRESETS["poster"]
    first["shadow"]["enabled"] = False
    assert second["shadow"]["enabled"] is True
