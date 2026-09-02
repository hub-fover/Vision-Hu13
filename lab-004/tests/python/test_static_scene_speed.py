import json
from pathlib import Path

import cv2
import numpy as np

from camera_measurement.contracts import ScaleReference, StaticSceneRegion
from camera_measurement.report import measure_frames, write_debug, write_report


def translated_stack(count=30, px_per_frame=2.0):
    rng = np.random.default_rng(4)
    base = (rng.random((240, 360)) * 255).astype(np.uint8)
    return [cv2.warpAffine(base, np.float32([[1, 0, i * px_per_frame], [0, 1, 0]]), (360, 240), borderMode=cv2.BORDER_REFLECT) for i in range(count)]


def test_static_scene_speed_converts_known_translation():
    report = measure_frames(
        translated_stack(),
        StaticSceneRegion(80, 60, 180, 120),
        ScaleReference.from_points((20, 20), (120, 20), 10, "m"),
        fps=10,
    )
    assert report.schema_version == "lab004.static-scene-speed.v2"
    assert abs(report.mean_speed_mps - 2.0) < 0.15
    assert report.velocity_kmh > 6.0
    assert report.valid_ratio > 0.8
    assert report.diagnostics.inlier_ratio >= 0.6


def test_report_and_debug_exports_use_speed_fields(tmp_path):
    report = measure_frames(
        translated_stack(8, 1.0),
        StaticSceneRegion(80, 60, 180, 120),
        ScaleReference.from_points((20, 20), (120, 20), 10, "m"),
        fps=10,
    )
    output = tmp_path / "speed.json"
    write_report(report, output)
    write_debug(report, tmp_path / "debug")
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert {"velocityMps", "velocityKmh", "directionDeg", "meanSpeedMps", "peakSpeedMps", "validRatio", "samples", "diagnostics"} <= set(payload)
    assert (tmp_path / "debug" / "speed.csv").exists()
    assert (tmp_path / "debug" / "diagnostics.json").exists()
    assert not (tmp_path / "debug" / "spectrum.json").exists()


def test_legacy_public_modules_are_not_exported():
    import camera_measurement

    assert not hasattr(camera_measurement, "dominant_frequency")
    assert not hasattr(camera_measurement, "track_template_sequence")
    assert not hasattr(camera_measurement, "measure_dic")
