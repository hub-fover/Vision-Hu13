import cv2
import numpy as np
import pytest

from camera_measurement.flow import track_flow_sequence
from camera_measurement.target import TargetRegion


def _frame(dx=0.0, camera_dx=0.0):
    image = np.zeros((160, 220), dtype=np.uint8)
    cv2.rectangle(image, (45, 45), (95, 95), 190, 2)
    cv2.line(image, (20, 20), (35, 55), 220, 2)
    cv2.circle(image, (160, 120), 12, 150, -1)
    matrix = np.float32([[1, 0, dx + camera_dx], [0, 1, 0]])
    return cv2.warpAffine(image, matrix, (220, 160))


def test_lk_flow_tracks_translation_and_rejects_camera_drift():
    frames = [_frame(dx) for dx in (0, 1.5, 3.0, 4.5)]
    samples, diagnostics = track_flow_sequence(frames, TargetRegion(42, 42, 58, 58))
    assert samples[-1].dx_px == pytest.approx(4.5, abs=1.0)
    assert diagnostics.camera_stable

    drifted = [_frame(dx=0, camera_dx=dx) for dx in (0, 2.0, 4.0)]
    _, drift_diagnostics = track_flow_sequence(
        drifted, TargetRegion(42, 42, 58, 58), background_region=TargetRegion(145, 105, 35, 35)
    )
    assert not drift_diagnostics.camera_stable


def test_flow_module_exports_stable_error_when_texture_missing():
    samples, diagnostics = track_flow_sequence(
        [np.zeros((100, 100), dtype=np.uint8)] * 2, TargetRegion(20, 20, 50, 50)
    )
    assert not samples[-1].valid
    assert samples[-1].error_code == "LOW_TEXTURE"
