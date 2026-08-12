import cv2
import numpy as np
import pytest

from defocus_depth import alignment
from defocus_depth.alignment import align_stack, detect_camera_motion
from defocus_depth.alignment import validate_scene_consistency
from defocus_depth.errors import DefocusDepthError


def _frame(offset=0):
    image = np.zeros((128, 128), np.uint8)
    cv2.rectangle(image, (20 + offset, 20), (108 + offset, 108), 255, 2)
    cv2.circle(image, (64 + offset, 64), 14, 180, 2)
    return image


def test_alignment_keeps_reference_shape():
    result = align_stack([_frame(-1), _frame(0), _frame(0), _frame(1), _frame(0)])
    assert len(result.frames) == 5
    assert result.frames[2].shape == (128, 128)
    assert result.errors[2] == 0


def test_detect_camera_motion_flags_large_translation():
    assert detect_camera_motion(np.array([[0.0, 0.0], [10.0, 10.0]]), max_shift_px=2)


def test_ecc_fallback_warps_input_toward_reference(monkeypatch):
    y, x = np.mgrid[:128, :128]
    reference = (80 + 80 * np.exp(-((x - 64) ** 2 + (y - 64) ** 2) / (2 * 20 ** 2))).astype(np.uint8)
    shifted = cv2.warpAffine(
        reference,
        np.float32([[1, 0, 3], [0, 1, 0]]),
        (128, 128),
        borderMode=cv2.BORDER_REFLECT,
    )
    monkeypatch.setattr(
        alignment,
        "_estimate",
        lambda *_: (_ for _ in ()).throw(DefocusDepthError("ALIGNMENT_FAILED")),
    )

    result = align_stack([shifted, reference, reference, reference, reference])

    raw_error = np.mean(np.abs(shifted.astype(np.float32) - reference.astype(np.float32)))
    aligned_error = np.mean(np.abs(result.frames[0].astype(np.float32) - reference.astype(np.float32)))
    assert result.transforms[0][0, 2] == pytest.approx(-3.0, abs=0.1)
    assert aligned_error < raw_error * 0.25


def test_scene_consistency_rejects_a_different_low_frequency_structure():
    left = np.zeros((128, 128), np.uint8)
    left[:, :48] = 220
    right = np.zeros((128, 128), np.uint8)
    right[:, 80:] = 220

    with pytest.raises(DefocusDepthError) as caught:
        validate_scene_consistency([left, left, left, right, left])

    assert caught.value.code == "SCENE_CHANGED"


def test_scene_consistency_accepts_blur_of_the_same_structure():
    image = np.zeros((128, 128), np.uint8)
    cv2.rectangle(image, (24, 30), (104, 98), 220, -1)
    frames = [cv2.GaussianBlur(image, (0, 0), sigma) if sigma else image for sigma in (4, 2, 0, 2, 4)]

    assert validate_scene_consistency(frames) > 0.8
