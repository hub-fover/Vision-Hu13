import cv2
import numpy as np

from defocus_depth.alignment import align_stack, detect_camera_motion


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
