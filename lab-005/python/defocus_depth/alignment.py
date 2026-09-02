from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .errors import DefocusDepthError
from .io import validate_stack


@dataclass
class AlignmentResult:
    frames: list[np.ndarray]
    transforms: list[np.ndarray]
    errors: list[float]
    inlier_ratios: list[float]


def detect_camera_motion(translations: np.ndarray, *, max_shift_px: float = 2.0) -> bool:
    values = np.asarray(translations, dtype=np.float32)
    if values.size == 0:
        return False
    if values.ndim == 3 and values.shape[-2:] == (2, 3):
        values = values[:, :, 2]
    return bool(np.max(np.linalg.norm(values, axis=-1)) > max_shift_px)


def _gray(frame: np.ndarray) -> np.ndarray:
    return frame if frame.ndim == 2 else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def validate_scene_consistency(
    frames: list[np.ndarray] | tuple[np.ndarray, ...],
    *,
    min_correlation: float = 0.55,
) -> float:
    """Reject a changed scene while remaining insensitive to ordinary defocus."""
    frames = list(validate_stack(frames))
    reference = _gray(frames[len(frames) // 2])

    def structure(frame: np.ndarray) -> np.ndarray:
        gray = cv2.resize(_gray(frame), (32, 32), interpolation=cv2.INTER_AREA)
        low = cv2.GaussianBlur(gray.astype(np.float32), (0, 0), 2.0)
        low -= float(low.mean())
        norm = float(np.linalg.norm(low))
        return low.ravel() / max(norm, 1e-8)

    target = structure(reference)
    correlations = [float(np.dot(target, structure(frame))) for frame in frames]
    minimum = min(correlations)
    if minimum < min_correlation:
        raise DefocusDepthError("SCENE_CHANGED", f"minimum structural correlation {minimum:.3f}")
    return minimum


def _estimate(reference: np.ndarray, frame: np.ndarray) -> tuple[np.ndarray, float, float]:
    orb = cv2.ORB_create(nfeatures=1500)
    key_ref, des_ref = orb.detectAndCompute(_gray(reference), None)
    key_frame, des_frame = orb.detectAndCompute(_gray(frame), None)
    if des_ref is None or des_frame is None or len(key_ref) < 6 or len(key_frame) < 6:
        raise DefocusDepthError("ALIGNMENT_FAILED")
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs = matcher.knnMatch(des_frame, des_ref, k=2)
    good = [m for m, n in pairs if m.distance < 0.75 * n.distance]
    if len(good) < 6:
        raise DefocusDepthError("ALIGNMENT_FAILED")
    src = np.float32([key_frame[m.queryIdx].pt for m in good])
    dst = np.float32([key_ref[m.trainIdx].pt for m in good])
    matrix, mask = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=2.0)
    if matrix is None or mask is None or int(mask.sum()) < 6:
        raise DefocusDepthError("ALIGNMENT_FAILED")
    inlier = mask.ravel().astype(bool)
    projected = cv2.transform(src[None], matrix)[0]
    error = float(np.median(np.linalg.norm(projected[inlier] - dst[inlier], axis=1)))
    ratio = float(inlier.mean())
    if error > 2.0 or ratio < 0.30:
        raise DefocusDepthError("CAMERA_MOVED")
    return matrix.astype(np.float32), error, ratio


def align_stack(frames: list[np.ndarray] | tuple[np.ndarray, ...], *, max_error_px: float = 2.0) -> AlignmentResult:
    frames = list(validate_stack(frames))
    validate_scene_consistency(frames)
    reference_index = len(frames) // 2
    reference = frames[reference_index]
    aligned = []
    transforms = []
    errors = []
    ratios = []
    for index, frame in enumerate(frames):
        if index == reference_index:
            identity = np.array([[1, 0, 0], [0, 1, 0]], dtype=np.float32)
            aligned.append(frame.copy()); transforms.append(identity); errors.append(0.0); ratios.append(1.0)
            continue
        try:
            matrix, error, ratio = _estimate(reference, frame)
        except DefocusDepthError:
            # A static stack can still be aligned when ORB finds no features;
            # use ECC only for the low-texture fallback and preserve a clear error
            # when it cannot converge.
            try:
                ref_gray = _gray(reference).astype(np.float32) / 255.0
                frame_gray = _gray(frame).astype(np.float32) / 255.0
                warp = np.eye(2, 3, dtype=np.float32)
                criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-5)
                _, warp = cv2.findTransformECC(ref_gray, frame_gray, warp, cv2.MOTION_EUCLIDEAN, criteria)
                # findTransformECC estimates reference -> input, whereas the
                # ORB path and warpAffine below require input -> reference.
                matrix = cv2.invertAffineTransform(warp)
                error, ratio = 1.0, 0.5
            except cv2.error as exc:
                raise DefocusDepthError("ALIGNMENT_FAILED") from exc
        if error > max_error_px:
            raise DefocusDepthError("CAMERA_MOVED")
        height, width = frame.shape[:2]
        aligned.append(cv2.warpAffine(frame, matrix, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT))
        transforms.append(matrix); errors.append(error); ratios.append(ratio)
    shifts = np.asarray([m[:, 2] for m in transforms])
    if detect_camera_motion(shifts, max_shift_px=8.0):
        raise DefocusDepthError("CAMERA_MOVED")
    return AlignmentResult(aligned, transforms, errors, ratios)
