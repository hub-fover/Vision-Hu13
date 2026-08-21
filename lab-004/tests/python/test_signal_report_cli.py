import json
from pathlib import Path

import numpy as np
import pytest

from camera_measurement.report import measure_frames, write_report
from camera_measurement.signal import dominant_frequency, resample_series
from camera_measurement.target import TargetRegion
from camera_measurement.scale import ScaleReference


def test_resample_and_fft_recover_known_frequency():
    timestamps = np.cumsum(np.full(180, 1 / 30.0))
    values = np.sin(2 * np.pi * 2.5 * timestamps)
    uniform_t, uniform_v = resample_series(timestamps, values, fps=30)
    peak = dominant_frequency(uniform_t, uniform_v)
    assert peak.frequency_hz == pytest.approx(2.5, abs=0.1)


def test_measure_frames_writes_json_csv_and_debug_outputs(tmp_path):
    frames = []
    for x in range(0, 12, 2):
        image = np.zeros((140, 180), dtype=np.uint8)
        image[45:95, 55 + x : 95 + x] = 220
        frames.append(image)
    scale = ScaleReference.from_points((10, 10), (110, 10), 100, "mm")
    report = measure_frames(
        frames,
        TargetRegion(55, 45, 64, 64),
        scale,
        fps=30,
        method="template",
        debug_dir=tmp_path / "debug",
    )
    assert report.schema_version == "lab004.measurement.v1"
    assert report.displacement.samples
    output = tmp_path / "report.json"
    write_report(report, output)
    data = json.loads(output.read_text(encoding="utf-8"))
    assert data["displacement"]["samples"]
    assert (tmp_path / "debug" / "displacement.csv").exists()
    assert (tmp_path / "debug" / "spectrum.json").exists()
