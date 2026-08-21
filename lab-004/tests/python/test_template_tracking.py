import cv2
import numpy as np
import pytest

from camera_measurement.target import TargetRegion
from camera_measurement.template import (
    match_template,
    quadratic_peak_offset,
    track_template_sequence,
)


def _textured_frame(shift_x=0.0, shift_y=0.0):
    rng = np.random.default_rng(4)
    image = np.zeros((180, 240), dtype=np.uint8)
    patch = rng.integers(20, 240, (65, 75), dtype=np.uint8)
    cv2.circle(patch, (35, 32), 12, 255, -1)
    matrix = np.float32([[1, 0, shift_x], [0, 1, shift_y]])
    return cv2.warpAffine(image + 0, matrix, (240, 180), borderMode=cv2.BORDER_CONSTANT) if False else cv2.warpAffine(
        cv2.copyMakeBorder(patch, 45, 70, 60, 105, cv2.BORDER_CONSTANT),
        matrix, (240, 180), borderMode=cv2.BORDER_CONSTANT
    )


def test_quadratic_peak_refinement_uses_neighbouring_scores():
    scores = np.array([0.60, 0.92, 0.70], dtype=np.float32)
    assert quadratic_peak_offset(scores) == pytest.approx(0.09, abs=0.02)


def test_template_match_returns_subpixel_translation_and_quality():
    base = _textured_frame()
    moved = _textured_frame(3.25, -2.0)
    result = match_template(base, moved, TargetRegion(60, 45, 75, 65))
    assert result.score > 0.75
    assert result.dx_px == pytest.approx(3.25, abs=0.4)
    assert result.dy_px == pytest.approx(-2.0, abs=0.4)


def test_template_sequence_reports_motion_and_invalid_lost_frame():
    frames = [_textured_frame(x, 0) for x in (0, 2, 4, 6)]
    frames.append(np.zeros_like(frames[0]))
    samples = track_template_sequence(frames, TargetRegion(60, 45, 75, 65))
    assert [round(s.dx_px) for s in samples[:4]] == [0, 2, 4, 6]
    assert samples[-1].valid is False
    assert samples[-1].error_code == "TEMPLATE_LOST"
