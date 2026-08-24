"""Pyramidal Lucas--Kanade tracking with forward/backward filtering."""

from __future__ import annotations

import cv2
import numpy as np

from .contracts import MAX_CAMERA_DRIFT_PX, TargetRegion, TrackingDiagnostics, TrackingSample
from .errors import MeasurementError


def _gray(frame: np.ndarray) -> np.ndarray:
    if frame is None or not isinstance(frame, np.ndarray) or frame.ndim not in (2, 3):
        raise MeasurementError("INVALID_FRAME", "Frame must be an image array.")
    return frame if frame.ndim == 2 else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def _features(gray: np.ndarray, region: TargetRegion) -> np.ndarray | None:
    mask = np.zeros(gray.shape[:2], dtype=np.uint8)
    x, y = max(0, int(round(region.x_px))), max(0, int(round(region.y_px)))
    x1, y1 = min(gray.shape[1], int(round(region.x_px + region.width_px))), min(gray.shape[0], int(round(region.y_px + region.height_px)))
    if x1 <= x or y1 <= y:
        return None
    mask[y:y1, x:x1] = 255
    points = cv2.goodFeaturesToTrack(gray, maxCorners=300, qualityLevel=0.01, minDistance=3, blockSize=5, mask=mask)
    return points


def _track_delta(previous: np.ndarray, current: np.ndarray, points: np.ndarray | None) -> tuple[np.ndarray | None, float]:
    if points is None or len(points) < 3:
        return None, float("inf")
    next_points, status, _ = cv2.calcOpticalFlowPyrLK(previous, current, points, None, winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    if next_points is None or status is None:
        return None, float("inf")
    back_points, back_status, _ = cv2.calcOpticalFlowPyrLK(current, previous, next_points, None, winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    good = status.reshape(-1).astype(bool)
    if back_status is not None:
        good &= back_status.reshape(-1).astype(bool)
    if back_points is not None:
        fb_error = np.linalg.norm(points.reshape(-1, 2) - back_points.reshape(-1, 2), axis=1)
        good &= fb_error <= 1.5
        median_fb = float(np.median(fb_error[good])) if np.any(good) else float("inf")
    else:
        median_fb = float("inf")
    if np.count_nonzero(good) < 3:
        return None, median_fb
    displacement = next_points.reshape(-1, 2)[good] - points.reshape(-1, 2)[good]
    return displacement, median_fb


def track_flow_sequence(
    frames: list[np.ndarray], region: TargetRegion, *, fps: float = 30.0,
    background_region: TargetRegion | None = None, max_camera_drift_px: float = MAX_CAMERA_DRIFT_PX,
) -> tuple[list[TrackingSample], TrackingDiagnostics]:
    try:
        fps_value = float(fps)
    except (TypeError, ValueError, OverflowError) as error:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be a positive finite number.") from error
    if not np.isfinite(fps_value) or fps_value <= 0:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be a positive finite number.")
    if not frames:
        raise MeasurementError("INVALID_FRAME", "At least one frame is required.")
    grays = [_gray(frame) for frame in frames]
    shape = grays[0].shape
    if any(gray.shape != shape for gray in grays):
        raise MeasurementError("SCENE_CHANGED", "Frames have different dimensions.")
    from .target import validate_target_region
    validate_target_region(region, (shape[1], shape[0]), min_size=32)
    if background_region is not None:
        validate_target_region(background_region, (shape[1], shape[0]), min_size=32)
    target_points = _features(grays[0], region)
    if target_points is None or len(target_points) < 3:
        sample = TrackingSample(0, 0.0, valid=False, error_code="LOW_TEXTURE")
        return [sample], TrackingDiagnostics(False, False, 0.0, 0.0, fps_value, "LOW_TEXTURE")
    background_points = _features(grays[0], background_region) if background_region else None
    background_trackable = background_region is None or background_points is not None and len(background_points) >= 3
    if background_region is not None and not background_trackable:
        raise MeasurementError("BACKGROUND_UNTRACKABLE", "Background has no trackable features.")
    samples = [TrackingSample(0, 0.0, 0.0, 0.0, score=1.0)]
    cumulative = np.zeros(2, dtype=np.float64)
    camera_stable = True
    scores: list[float] = [1.0]
    previous = grays[0]
    for index, current in enumerate(grays[1:], 1):
        target_delta, fb = _track_delta(previous, current, target_points)
        background_delta, background_fb = _track_delta(previous, current, background_points) if background_points is not None else (None, 0.0)
        if background_delta is not None:
            camera_drift = float(np.linalg.norm(np.median(background_delta, axis=0)))
            if camera_drift > max_camera_drift_px:
                camera_stable = False
        if target_delta is None:
            samples.append(TrackingSample(index, index / fps_value, valid=False, error_code="LOW_TEXTURE" if not np.isfinite(fb) else "TEMPLATE_LOST"))
        elif not camera_stable:
            samples.append(TrackingSample(index, index / fps_value, valid=False, error_code="CAMERA_MOVED"))
        else:
            delta = np.median(target_delta, axis=0)
            cumulative += delta
            score = float(np.exp(-max(fb, 0.0))) if np.isfinite(fb) else 0.0
            samples.append(TrackingSample(index, index / fps_value, float(cumulative[0]), float(cumulative[1]), score=score))
            scores.append(score)
        previous = current
        # Re-detect on the current frame to avoid accumulating stale points.
        target_points = _features(current, region)
        if background_region is not None:
            background_points = _features(current, background_region)
            if background_points is None or len(background_points) < 3:
                background_trackable = False
                camera_stable = False
                failure = TrackingSample(index, index / fps_value, valid=False, error_code="BACKGROUND_UNTRACKABLE")
                if samples and samples[-1].frame_index == index:
                    samples[-1] = failure
                else:
                    samples.append(failure)
                continue
    valid = [sample for sample in samples if sample.valid]
    diagnostics = TrackingDiagnostics(
        camera_stable=camera_stable,
        background_trackable=background_trackable,
        valid_ratio=len(valid) / len(samples),
        mean_score=float(np.mean(scores)) if scores else 0.0,
        fps=fps_value,
        error_code=("BACKGROUND_UNTRACKABLE" if not background_trackable else (None if camera_stable else "CAMERA_MOVED")),
    )
    return samples, diagnostics


def _tracked_correspondences(
    previous: np.ndarray, current: np.ndarray, points: np.ndarray | None,
    *, max_forward_backward_error: float = 1.5,
) -> tuple[np.ndarray | None, np.ndarray | None, float]:
    """Return LK correspondences that also survive a backward check."""
    if points is None or len(points) < 3:
        return None, None, float("inf")
    next_points, status, _ = cv2.calcOpticalFlowPyrLK(
        previous, current, points, None, winSize=(21, 21), maxLevel=3,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
    )
    if next_points is None or status is None:
        return None, None, float("inf")
    back_points, back_status, _ = cv2.calcOpticalFlowPyrLK(
        current, previous, next_points, None, winSize=(21, 21), maxLevel=3,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
    )
    good = status.reshape(-1).astype(bool)
    if back_status is not None:
        good &= back_status.reshape(-1).astype(bool)
    if back_points is None:
        return None, None, float("inf")
    fb_error = np.linalg.norm(points.reshape(-1, 2) - back_points.reshape(-1, 2), axis=1)
    good &= np.isfinite(fb_error) & (fb_error <= max_forward_backward_error)
    if np.count_nonzero(good) < 3:
        return None, None, float(np.median(fb_error[good])) if np.any(good) else float("inf")
    return points.reshape(-1, 2)[good], next_points.reshape(-1, 2)[good], float(np.median(fb_error[good]))


def track_camera_motion_sequence(
    frames: list[np.ndarray], region: TargetRegion, *, fps: float = 30.0,
    max_features: int = 300, min_inliers: int = 12,
    min_inlier_ratio: float = 0.60, ransac_threshold_px: float = 2.0,
    max_forward_backward_error: float = 1.5,
) -> tuple[list[TrackingSample], TrackingDiagnostics]:
    """Estimate moving-phone image motion from static-scene features.

    Features are tracked with pyramidal LK, filtered forward/backward, and
    fitted with a RANSAC partial-affine model.  The cumulative model is sampled
    at the selected ROI centre, which keeps the local ground-plane scale useful
    for a phone moving through a mostly planar scene.
    """
    try:
        fps_value = float(fps)
    except (TypeError, ValueError, OverflowError) as error:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be a positive finite number.") from error
    if not np.isfinite(fps_value) or fps_value <= 0:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be a positive finite number.")
    if not frames:
        raise MeasurementError("INVALID_FRAME", "At least one frame is required.")
    grays = [_gray(frame) for frame in frames]
    shape = grays[0].shape
    if any(gray.shape != shape for gray in grays):
        raise MeasurementError("SCENE_CHANGED", "Frames have different dimensions.")
    from .target import validate_target_region
    validate_target_region(region, (shape[1], shape[0]), min_size=32)

    def detect(gray: np.ndarray) -> np.ndarray | None:
        return cv2.goodFeaturesToTrack(
            gray, maxCorners=int(max_features), qualityLevel=0.01,
            minDistance=5, blockSize=5,
        )

    samples = [TrackingSample(0, 0.0, 0.0, 0.0, score=1.0)]
    previous = grays[0]
    points = detect(previous)
    cumulative = np.eye(3, dtype=np.float64)
    model_metrics: list[tuple[int, float, float]] = []
    error_code: str | None = None
    center = np.asarray(region.center_px, dtype=np.float64)

    for index, current in enumerate(grays[1:], 1):
        old_points, new_points, fb_error = _tracked_correspondences(
            previous, current, points, max_forward_backward_error=max_forward_backward_error,
        )
        if old_points is None or new_points is None or len(old_points) < min_inliers:
            samples.append(TrackingSample(index, index / fps_value, valid=False, error_code="TEMPLATE_LOST"))
            error_code = error_code or "TEMPLATE_LOST"
            previous = current
            points = detect(current)
            continue
        matrix, inliers = cv2.estimateAffinePartial2D(
            old_points, new_points, method=cv2.RANSAC,
            ransacReprojThreshold=float(ransac_threshold_px),
            maxIters=2000, confidence=0.99, refineIters=10,
        )
        if matrix is None or inliers is None:
            samples.append(TrackingSample(index, index / fps_value, valid=False, error_code="TEMPLATE_LOST"))
            error_code = error_code or "TEMPLATE_LOST"
        else:
            mask = inliers.reshape(-1).astype(bool)
            inlier_count = int(np.count_nonzero(mask))
            inlier_ratio = inlier_count / max(1, len(old_points))
            projected = cv2.transform(old_points.reshape(-1, 1, 2), matrix).reshape(-1, 2)
            reprojection = np.linalg.norm(projected - new_points, axis=1)
            median_reprojection = float(np.median(reprojection[mask])) if inlier_count else float("inf")
            model_metrics.append((inlier_count, inlier_ratio, median_reprojection))
            if inlier_count < min_inliers or inlier_ratio < min_inlier_ratio or not np.isfinite(median_reprojection):
                samples.append(TrackingSample(index, index / fps_value, valid=False, error_code="TEMPLATE_LOST"))
                error_code = error_code or "TEMPLATE_LOST"
            else:
                step = np.eye(3, dtype=np.float64)
                step[:2, :] = matrix
                cumulative = step @ cumulative
                homogeneous = np.array([center[0], center[1], 1.0], dtype=np.float64)
                mapped = cumulative @ homogeneous
                if abs(mapped[2]) > 1e-12:
                    mapped /= mapped[2]
                dx, dy = mapped[0] - center[0], mapped[1] - center[1]
                score = float(np.clip(inlier_ratio * np.exp(-median_reprojection / 2.0), 0.0, 1.0))
                samples.append(TrackingSample(index, index / fps_value, float(dx), float(dy), score=score))
        previous = current
        points = detect(current)

    valid = [sample for sample in samples if sample.valid]
    if model_metrics:
        inlier_count = int(round(float(np.median([item[0] for item in model_metrics]))))
        inlier_ratio = float(np.median([item[1] for item in model_metrics]))
        reprojection = float(np.median([item[2] for item in model_metrics]))
    else:
        inlier_count, inlier_ratio, reprojection = 0, 0.0, float("inf")
    diagnostics = TrackingDiagnostics(
        camera_stable=True,
        background_trackable=True,
        valid_ratio=len(valid) / len(samples) if samples else 0.0,
        mean_score=float(np.mean([sample.score for sample in valid])) if valid else 0.0,
        fps=fps_value,
        error_code=error_code if not valid or len(valid) < 2 else None,
        motion_model="lk-ransac-affine",
        inlier_count=inlier_count,
        inlier_ratio=inlier_ratio,
        median_reprojection_error_px=reprojection if np.isfinite(reprojection) else 0.0,
    )
    return samples, diagnostics
