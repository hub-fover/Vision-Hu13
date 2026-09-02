"""LK + forward/backward filtering + RANSAC for static-scene speed."""

from __future__ import annotations

import cv2
import numpy as np

from .contracts import MAX_CAMERA_DRIFT_PX, SpeedDiagnostics, SpeedSample, StaticSceneRegion
from .errors import MeasurementError
from .target import validate_target_region


def _gray(frame: np.ndarray) -> np.ndarray:
    if frame is None or not isinstance(frame, np.ndarray) or frame.ndim not in (2, 3) or frame.shape[0] < 1 or frame.shape[1] < 1:
        raise MeasurementError("INVALID_FRAME", "Frame must be a non-empty image.")
    if frame.ndim == 2:
        return frame if frame.dtype == np.uint8 else np.clip(frame, 0, 255).astype(np.uint8)
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def _features(gray: np.ndarray, region: StaticSceneRegion, max_features: int = 300) -> np.ndarray | None:
    mask = np.zeros(gray.shape[:2], dtype=np.uint8)
    x0 = max(0, int(round(region.x_px)))
    y0 = max(0, int(round(region.y_px)))
    x1 = min(gray.shape[1], int(round(region.x_px + region.width_px)))
    y1 = min(gray.shape[0], int(round(region.y_px + region.height_px)))
    if x1 <= x0 or y1 <= y0:
        return None
    mask[y0:y1, x0:x1] = 255
    return cv2.goodFeaturesToTrack(gray, maxCorners=int(max_features), qualityLevel=0.01, minDistance=4, blockSize=5, mask=mask)


def _tracked_correspondences(previous: np.ndarray, current: np.ndarray, points: np.ndarray | None, *, max_forward_backward_error: float = 1.5) -> tuple[np.ndarray | None, np.ndarray | None, float]:
    if points is None or len(points) < 3:
        return None, None, float("inf")
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01)
    next_points, status, _ = cv2.calcOpticalFlowPyrLK(previous, current, points, None, winSize=(21, 21), maxLevel=3, criteria=criteria)
    if next_points is None or status is None:
        return None, None, float("inf")
    back_points, back_status, _ = cv2.calcOpticalFlowPyrLK(current, previous, next_points, None, winSize=(21, 21), maxLevel=3, criteria=criteria)
    if back_points is None:
        return None, None, float("inf")
    fb_error = np.linalg.norm(points.reshape(-1, 2) - back_points.reshape(-1, 2), axis=1)
    good = status.reshape(-1).astype(bool) & np.isfinite(fb_error) & (fb_error <= max_forward_backward_error)
    if back_status is not None:
        good &= back_status.reshape(-1).astype(bool)
    median = float(np.median(fb_error[good])) if np.any(good) else float("inf")
    if int(np.count_nonzero(good)) < 3:
        return None, None, median
    return points.reshape(-1, 2)[good], next_points.reshape(-1, 2)[good], median


def track_camera_motion_sequence(
    frames: list[np.ndarray], region: StaticSceneRegion, *, fps: float = 30.0,
    max_features: int = 300, min_inliers: int = 12, min_inlier_ratio: float = 0.60,
    ransac_threshold_px: float = 2.0, max_forward_backward_error: float = 1.5,
) -> tuple[list[SpeedSample], SpeedDiagnostics]:
    """Track static-scene image motion and return cumulative pixel offsets.

    The image motion is intentionally left in pixel coordinates. ``speed.py``
    reverses its sign and applies the user-provided local scale.
    """
    try:
        fps_value = float(fps)
    except (TypeError, ValueError, OverflowError) as exc:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be a positive finite number.") from exc
    if not np.isfinite(fps_value) or fps_value <= 0:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be a positive finite number.")
    if not frames:
        raise MeasurementError("INVALID_FRAME", "At least one frame is required.")
    grays = [_gray(frame) for frame in frames]
    shape = grays[0].shape
    if any(gray.shape != shape for gray in grays):
        raise MeasurementError("SCENE_CHANGED", "Frames have different dimensions.")
    validate_target_region(region, (shape[1], shape[0]), min_size=32)
    points = _features(grays[0], region, max_features)
    if points is None or len(points) < min_inliers:
        sample = SpeedSample(0, 0.0, valid=False, error_code="LOW_TEXTURE")
        return [sample], SpeedDiagnostics(camera_stable=True, valid_ratio=0.0, fps=fps_value, error_code="LOW_TEXTURE")
    center = np.asarray(region.center_px, dtype=np.float64)
    cumulative = np.eye(3, dtype=np.float64)
    samples: list[SpeedSample] = [SpeedSample(0, 0.0, confidence=1.0, valid=True)]
    metrics: list[tuple[int, float, float, float, int]] = []
    previous = grays[0]
    failures: list[dict[str, object]] = []

    for index, current in enumerate(grays[1:], 1):
        old_points, new_points, fb_error = _tracked_correspondences(previous, current, points, max_forward_backward_error=max_forward_backward_error)
        if old_points is None or new_points is None or len(old_points) < min_inliers:
            samples.append(SpeedSample(index, index / fps_value, confidence=0.0, valid=False, error_code="FLOW_LOST"))
            failures.append({"startFrame": index, "endFrame": index, "errorCode": "FLOW_LOST"})
        else:
            matrix, inliers = cv2.estimateAffinePartial2D(old_points, new_points, method=cv2.RANSAC, ransacReprojThreshold=float(ransac_threshold_px), maxIters=2000, confidence=0.99, refineIters=10)
            if matrix is None or inliers is None:
                samples.append(SpeedSample(index, index / fps_value, confidence=0.0, valid=False, error_code="SCENE_CHANGED"))
                failures.append({"startFrame": index, "endFrame": index, "errorCode": "SCENE_CHANGED"})
            else:
                mask = inliers.reshape(-1).astype(bool)
                inlier_count = int(np.count_nonzero(mask))
                ratio = inlier_count / max(1, len(old_points))
                projected = cv2.transform(old_points.reshape(-1, 1, 2), matrix).reshape(-1, 2)
                errors = np.linalg.norm(projected - new_points, axis=1)
                reproj = float(np.median(errors[mask])) if inlier_count else float("inf")
                rotation = abs(float(np.arctan2(matrix[1, 0], matrix[0, 0])))
                metrics.append((inlier_count, ratio, reproj, fb_error, len(old_points)))
                if inlier_count < min_inliers or ratio < min_inlier_ratio:
                    code = "SCENE_CHANGED"
                    samples.append(SpeedSample(index, index / fps_value, confidence=0.0, valid=False, error_code=code))
                    failures.append({"startFrame": index, "endFrame": index, "errorCode": code})
                elif rotation > np.deg2rad(20):
                    code = "CAMERA_ROTATION_TOO_LARGE"
                    samples.append(SpeedSample(index, index / fps_value, confidence=0.0, valid=False, error_code=code))
                    failures.append({"startFrame": index, "endFrame": index, "errorCode": code})
                else:
                    step = np.eye(3, dtype=np.float64)
                    step[:2] = matrix
                    cumulative = step @ cumulative
                    mapped = cumulative @ np.array([center[0], center[1], 1.0])
                    mapped /= mapped[2] if abs(mapped[2]) > 1e-12 else 1.0
                    dx, dy = float(mapped[0] - center[0]), float(mapped[1] - center[1])
                    confidence = float(np.clip(ratio * np.exp(-max(reproj, 0.0) / 2.0) * np.exp(-max(fb_error, 0.0)), 0.0, 1.0))
                    samples.append(SpeedSample(index, index / fps_value, confidence=confidence, valid=True, dx_px=dx, dy_px=dy))
        previous = current
        points = _features(current, region, max_features)

    valid = [sample for sample in samples if sample.valid]
    if metrics:
        med = np.median(np.asarray(metrics), axis=0)
        inlier_count, ratio, reproj, fb, tracked_count = int(round(med[0])), float(med[1]), float(med[2]), float(med[3]), int(round(med[4]))
    else:
        inlier_count, ratio, reproj, fb, tracked_count = 0, 0.0, 0.0, float("inf"), 0
    diagnostics = SpeedDiagnostics(inlier_count=inlier_count, inlier_ratio=ratio, median_reprojection_error_px=0.0 if not np.isfinite(reproj) else reproj, forward_backward_error_px=0.0 if not np.isfinite(fb) else fb, tracked_point_count=tracked_count, camera_stable=True, valid_ratio=len(valid) / len(samples), scene_texture_score=float(len(points) / max_features) if points is not None else 0.0, fps=fps_value, failure_intervals=tuple(failures), error_code=(None if len(valid) > 1 else (samples[-1].error_code or "FLOW_LOST")))
    return samples, diagnostics


def track_flow_sequence(frames: list[np.ndarray], region: StaticSceneRegion, *, fps: float = 30.0, **kwargs):
    """Deprecated alias returning the v2 static-scene tracker output."""
    return track_camera_motion_sequence(frames, region, fps=fps, **kwargs)
