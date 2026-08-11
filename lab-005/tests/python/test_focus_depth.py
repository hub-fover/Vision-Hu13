import numpy as np
import pytest

from defocus_depth.depth import estimate_relative_depth, quadratic_peak
from defocus_depth.errors import DefocusDepthError
from defocus_depth.focus_metrics import focus_curve, tenengrad, texture_strength


def test_tenengrad_and_texture_are_normalized():
    image = np.zeros((64, 64), np.uint8)
    image[:, 32:] = 255
    assert tenengrad(image) > 0
    assert 0 <= texture_strength(image) <= 1


def test_quadratic_peak_interpolates_between_frames():
    idx, prominence = quadratic_peak(np.array([1.0, 4.0, 3.0]))
    assert 1.2 < idx < 1.3
    assert prominence > 0


def test_relative_depth_uses_peak_order_and_confidence():
    scores = np.zeros((5, 2, 2), dtype=np.float32)
    scores[:, 0, 0] = [0.1, 0.2, 0.9, 0.2, 0.1]
    scores[:, 0, 1] = [0.9, 0.2, 0.1, 0.2, 0.1]
    scores[:, 1, :] = 0.1
    result = estimate_relative_depth(scores, texture=np.ones((2, 2), np.float32))
    assert result.depth[0, 0] > result.depth[0, 1]
    assert result.valid[0, 0]
    assert not result.valid[1, 0]


def test_focus_curve_rejects_small_spread():
    with pytest.raises(DefocusDepthError, match="FOCUS_SPREAD_TOO_SMALL"):
        focus_curve([np.ones((8, 8), np.uint8)] * 5)
