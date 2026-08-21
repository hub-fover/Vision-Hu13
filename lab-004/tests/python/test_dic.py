import cv2
import numpy as np
import pytest

from camera_measurement.dic import estimate_dic_translation
from camera_measurement.target import TargetRegion


def test_dic_teaching_mode_recovers_grid_translation():
    base = np.zeros((140, 180), dtype=np.uint8)
    for y in range(20, 120, 15):
        for x in range(20, 160, 15):
            cv2.circle(base, (x, y), 3, 200, -1)
    moved = cv2.warpAffine(base, np.float32([[1, 0, 3], [0, 1, -2]]), (180, 140))
    result = estimate_dic_translation(base, moved, TargetRegion(20, 20, 140, 100))
    assert result.dx_px == pytest.approx(3, abs=0.8)
    assert result.dy_px == pytest.approx(-2, abs=0.8)
