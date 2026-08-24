from pathlib import Path

import cv2
import numpy as np

from camera_measurement.io import load_video
from camera_measurement.report import measure_frames
from camera_measurement.scale import ScaleReference
from camera_measurement.target import TargetRegion


def test_real_airplane_video_runs_through_tracker_and_rejects_camera_motion():
    source = Path(__file__).parents[2] / "assets" / "samples" / "videos" / "flight-landing-pune-clip.mp4"
    sequence = load_video(source, max_side=640, max_frames=60)
    assert len(sequence.frames) == 60
    assert sequence.image_size_px == (640, 360)
    assert sequence.fps > 0
    report = measure_frames(
        sequence.frames,
        TargetRegion(220, 100, 160, 100),
        ScaleReference.from_points((10, 10), (110, 10), 100, "mm"),
        fps=sequence.fps,
        timestamps_s=sequence.timestamps_s,
    )
    assert len(report.displacement.samples) == 60
    assert report.diagnostics.error_code == "CAMERA_MOVED"
    assert "CAMERA_MOVED" in report.errors
    assert report.spectrum is None, "camera motion must block a fabricated frequency result"


def test_real_airplane_video_can_run_reference_speed_mode_without_blocking_on_camera_motion():
    source = Path(__file__).parents[2] / "assets" / "samples" / "videos" / "flight-landing-pune-clip.mp4"
    sequence = load_video(source, max_side=640, max_frames=60)
    report = measure_frames(
        sequence.frames,
        TargetRegion(40, 180, 180, 100),
        ScaleReference.from_points((10, 10), (110, 10), 10, "m"),
        fps=sequence.fps,
        timestamps_s=sequence.timestamps_s,
        method="camera-speed",
    )
    assert report.method == "camera-speed"
    assert report.velocity is not None
    assert report.velocity.quality == "reference-only"
    assert len(report.velocity.samples) == 60
    assert "CAMERA_MOVED" not in report.errors


def test_camera_speed_uses_lk_and_ransac_on_a_translated_static_scene():
    rng = np.random.default_rng(4)
    base = (rng.random((360, 640)) * 255).astype(np.uint8)
    frames = []
    for index in range(30):
        matrix = np.float32([[1, 0, index * 2.0], [0, 1, 0]])
        frames.append(cv2.warpAffine(base, matrix, (640, 360), borderMode=cv2.BORDER_REFLECT))
    report = measure_frames(
        frames,
        TargetRegion(240, 120, 120, 100),
        ScaleReference.from_points((20, 20), (120, 20), 10, "m"),
        fps=10,
        method="camera-speed",
    )
    assert report.diagnostics.motion_model == "lk-ransac-affine"
    assert report.diagnostics.inlier_ratio >= 0.6
    assert report.velocity is not None
    assert abs(report.velocity.mean_speed_mps - 2.0) < 0.15
