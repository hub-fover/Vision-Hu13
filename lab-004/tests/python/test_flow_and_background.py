import cv2
import numpy as np
import pytest

from camera_measurement.flow import track_flow_sequence
from camera_measurement.contracts import StaticSceneRegion


def _textured_frames(count=12, step=1.5):
    rng = np.random.default_rng(7)
    base = (rng.random((180, 260)) * 255).astype(np.uint8)
    return [cv2.warpAffine(base, np.float32([[1, 0, index * step], [0, 1, 0]]), (260, 180), borderMode=cv2.BORDER_REFLECT) for index in range(count)]


def test_lk_ransac_tracks_static_scene_translation():
    samples, diagnostics = track_flow_sequence(_textured_frames(), StaticSceneRegion(40, 40, 160, 100), fps=30)
    assert samples[-1].valid
    assert samples[-1].dx_px == pytest.approx(16.5, abs=2.0)
    assert diagnostics.inlier_ratio >= 0.6
    assert diagnostics.tracked_point_count >= 12


def test_low_texture_returns_actionable_failure():
    samples, diagnostics = track_flow_sequence([np.zeros((120, 180), dtype=np.uint8)] * 2, StaticSceneRegion(20, 20, 80, 80))
    assert not samples[-1].valid
    assert samples[-1].error_code == "LOW_TEXTURE"
    assert diagnostics.error_code == "LOW_TEXTURE"
