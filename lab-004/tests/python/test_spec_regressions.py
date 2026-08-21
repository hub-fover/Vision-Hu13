import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from camera_measurement.contracts import ScaleReference, TargetRegion
from camera_measurement.errors import MeasurementError
from camera_measurement.flow import track_flow_sequence
from camera_measurement.report import measure_frames
from camera_measurement.signal import dominant_frequency, resample_series


def _frames():
    frames = []
    for shift in (0, 1, 2):
        image = np.zeros((140, 180), dtype=np.uint8)
        cv2.rectangle(image, (55 + shift, 45), (120 + shift, 110), 220, -1)
        for offset in range(0, 65, 10):
            cv2.line(image, (55 + shift + offset, 45), (55 + shift + offset, 110), 120, 1)
        frames.append(image)
    return frames


def test_measure_frames_rejects_invalid_fps_before_tracking():
    scale = ScaleReference.from_points((10, 10), (110, 10), 100, "mm")
    with pytest.raises(MeasurementError, match="FPS_UNSTABLE"):
        measure_frames(_frames(), TargetRegion(55, 45, 65, 65), scale, fps=0)
    with pytest.raises(MeasurementError, match="FPS_UNSTABLE"):
        measure_frames(_frames(), TargetRegion(55, 45, 65, 65), scale, fps=float("nan"))
    with pytest.raises(MeasurementError, match="FPS_UNSTABLE"):
        measure_frames(_frames(), TargetRegion(55, 45, 65, 65), scale, fps=30, timestamps_s=np.array([0, 0.1, 0.05]))


def test_resample_series_rejects_non_monotonic_input_without_sorting():
    with pytest.raises(MeasurementError, match="FPS_UNSTABLE"):
        resample_series(np.array([0.0, 0.1, 0.05]), np.array([0.0, 1.0, 2.0]))


def test_dominant_frequency_rejects_nonfinite_or_nonmonotonic_samples():
    times = np.arange(128, dtype=np.float64) / 30.0
    values = np.sin(times)
    with pytest.raises(MeasurementError, match="FPS_UNSTABLE"):
        dominant_frequency(times, np.where(np.arange(128) == 8, np.nan, values))
    non_monotonic = times.copy()
    non_monotonic[20] = non_monotonic[19]
    with pytest.raises(MeasurementError, match="FPS_UNSTABLE"):
        dominant_frequency(non_monotonic, values)


def test_scale_units_are_limited_to_contract_units():
    with pytest.raises(MeasurementError, match="INVALID_SCALE"):
        ScaleReference.from_points((0, 0), (100, 0), 1, "in")


def test_report_serialization_names_match_shared_contract():
    scale = ScaleReference.from_points((10, 10), (110, 10), 100, "mm")
    report = measure_frames(_frames(), TargetRegion(55, 45, 65, 65), scale, fps=30)
    data = report.to_dict()
    assert set(data) >= {"schemaVersion", "method", "scale", "displacement", "spectrum", "diagnostics", "errors"}
    assert set(data["scale"]) == {"p1Px", "p2Px", "realDistanceM", "unit"}
    assert set(data["displacement"]) >= {"samples", "peakToPeakM", "rmsM", "peakToPeakPx"}
    assert set(data["samples"][0]) if "samples" in data else True
    sample = data["displacement"]["samples"][0]
    assert set(sample) >= {"frameIndex", "timeS", "dxPx", "dyPx", "dxM", "dyM", "score", "valid", "errorCode"}
    assert set(data["diagnostics"]) >= {"cameraStable", "backgroundTrackable", "validRatio", "meanScore", "fps", "errorCode"}


def test_background_anchor_redetection_failure_is_reported():
    base = np.zeros((160, 220), dtype=np.uint8)
    cv2.rectangle(base, (45, 45), (105, 105), 200, 2)
    for y in range(110, 150, 12):
        for x in range(145, 200, 12):
            cv2.circle(base, (x, y), 3, 160, -1)
    frames = [base, cv2.warpAffine(base, np.float32([[1, 0, 1], [0, 1, 0]]), (220, 160)), np.zeros_like(base)]
    samples, diagnostics = track_flow_sequence(
        frames, TargetRegion(42, 42, 64, 64), background_region=TargetRegion(135, 95, 70, 65)
    )
    assert diagnostics.background_trackable is False
    assert any(sample.error_code == "BACKGROUND_UNTRACKABLE" for sample in samples)


def test_installation_excludes_camera_pose_package():
    text = (Path(__file__).parents[2] / "pyproject.toml").read_text(encoding="utf-8")
    assert 'include = ["camera_measurement*"]' in text


def test_flow_and_report_reject_invalid_background_roi():
    frames = _frames()
    with pytest.raises(MeasurementError, match="TARGET_TOO_SMALL"):
        track_flow_sequence(frames, TargetRegion(55, 45, 65, 65), background_region=TargetRegion(-1, 0, 65, 65))
    scale = ScaleReference.from_points((10, 10), (110, 10), 100, "mm")
    with pytest.raises(MeasurementError, match="TARGET_TOO_SMALL"):
        measure_frames(frames, TargetRegion(55, 45, 65, 65), scale, background_region=TargetRegion(150, 100, 65, 65))


def test_direct_trackers_reject_invalid_fps():
    from camera_measurement.template import track_template_sequence
    with pytest.raises(MeasurementError, match="FPS_UNSTABLE"):
        track_template_sequence(_frames(), TargetRegion(55, 45, 65, 65), fps=0)
    with pytest.raises(MeasurementError, match="FPS_UNSTABLE"):
        track_flow_sequence(_frames(), TargetRegion(55, 45, 65, 65), fps=float("nan"))


def test_debug_spectrum_preserves_report_error_code(tmp_path):
    frames = _frames() + [np.zeros_like(_frames()[0])]
    scale = ScaleReference.from_points((10, 10), (110, 10), 100, "mm")
    report = measure_frames(frames, TargetRegion(55, 45, 65, 65), scale, debug_dir=tmp_path)
    payload = json.loads((tmp_path / "spectrum.json").read_text(encoding="utf-8"))
    assert payload["error"] in report.errors
