from __future__ import annotations

import numpy as np

from exposure_fusion import (
    compute_quality_weights,
    detect_motion,
    fuse_pyramids,
    protect_motion,
)


def test_quality_weights_normalize_per_pixel(exposure_stack) -> None:
    weights, components = compute_quality_weights(exposure_stack)

    assert weights.shape == (3, *exposure_stack[0].shape[:2])
    assert np.allclose(np.sum(weights, axis=0), 1, atol=1e-5)
    assert len(components) == 3


def test_motion_protection_selects_middle_exposure(exposure_stack) -> None:
    dark, normal, bright = [image.copy() for image in exposure_stack]
    bright[80:140, 100:180] = (0, 255, 0)
    weights, _ = compute_quality_weights((dark, normal, bright))

    mask = detect_motion((dark, normal, bright))
    protected, metrics = protect_motion(weights, mask)

    assert metrics.detected_fraction > 0
    assert float(np.mean(protected[1][mask > 0])) > 0.9


def test_identical_pyramid_inputs_reconstruct_without_drift(exposure_stack) -> None:
    normal = exposure_stack[1]
    weights = np.full((3, *normal.shape[:2]), 1 / 3, dtype=np.float32)

    output = fuse_pyramids((normal, normal, normal), weights, levels=5)

    assert np.max(np.abs(output * 255 - normal)) < 1.5
