from __future__ import annotations

import cv2
import numpy as np
import pytest


@pytest.fixture
def exposure_stack() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(1303)
    base = rng.integers(25, 205, size=(280, 420, 3), dtype=np.uint8)
    for index in range(24):
        center = (20 + index * 16, 30 + (index % 7) * 31)
        cv2.circle(base, center, 4 + index % 9, (240, 30 + index * 5, 80), -1)
    cv2.putText(base, "LAB 003 HDR", (48, 150), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (250, 250, 250), 3)
    dark = np.clip(base.astype(np.float32) * 0.28, 0, 255).astype(np.uint8)
    normal = base.copy()
    bright = np.clip(base.astype(np.float32) * 2.2, 0, 255).astype(np.uint8)
    return dark, normal, bright
