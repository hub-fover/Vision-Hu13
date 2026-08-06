"""Resource-free planar optical-flow tracking state machine."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import cv2
import numpy as np
from numpy.typing import ArrayLike, NDArray

from .contracts import CameraIntrinsics, MeasurementReport, PlaneTarget, PoseEstimate, TrackingMetrics
from .errors import CameraPoseError
from .geometry import plane_object_points, validate_quad
from .pose import estimate_pose


@dataclass(frozen=True)
class TrackingState:
    status: Literal["tracking", "lost"]
    quad_px: NDArray[np.float64]
    pose: PoseEstimate | None
    measurements: MeasurementReport | None
    metrics: TrackingMetrics


def initialize_tracking_points(frame: ArrayLike, quad_px: ArrayLike, *, max_points: int = 300, border_px: int = 8) -> NDArray[np.float32]:
    gray = _gray(frame)
    quad = validate_quad(quad_px, gray.shape[1], gray.shape[0])
    mask = np.zeros_like(gray)
    center = quad.mean(axis=0)
    directions = quad - center
    lengths = np.linalg.norm(directions, axis=1, keepdims=True)
    expanded = quad + directions / np.maximum(lengths, 1e-9) * border_px
    expanded[:, 0] = np.clip(expanded[:, 0], 0, gray.shape[1] - 1)
    expanded[:, 1] = np.clip(expanded[:, 1], 0, gray.shape[0] - 1)
    cv2.fillConvexPoly(mask, np.rint(expanded).astype(np.int32), 255)
    points = cv2.goodFeaturesToTrack(gray, maxCorners=min(300, max_points), qualityLevel=0.01, minDistance=5, mask=mask, blockSize=5)
    if points is None or len(points) < 12:
        raise CameraPoseError("LOW_TEXTURE", "At least 12 trackable features are required.")
    return points.reshape(-1, 1, 2).astype(np.float32)


class PlanarTracker:
    def __init__(self, target: PlaneTarget, intrinsics: CameraIntrinsics):
        self._object_points = plane_object_points(target)
        self._intrinsics = intrinsics
        self._gray: NDArray[np.uint8] | None = None
        self._points: NDArray[np.float32] | None = None
        self._quad: NDArray[np.float64] | None = None
        self._pose: PoseEstimate | None = None
        self._bad = 0
        self._lost = False

    def initialize(self, frame: ArrayLike, quad_px: ArrayLike) -> TrackingState:
        gray = _gray(frame)
        quad = validate_quad(quad_px, gray.shape[1], gray.shape[0])
        points = initialize_tracking_points(gray, quad)
        self._gray, self._points, self._quad = gray, points, quad
        self._bad, self._lost = 0, False
        self._pose = self._estimate(quad)
        return self._state("tracking", len(points), 1.0, 0.0)

    def update(self, frame: ArrayLike) -> TrackingState:
        if self._lost:
            raise CameraPoseError("TRACKING_LOST", "Explicit reinitialization is required.")
        if self._gray is None or self._points is None or self._quad is None:
            raise CameraPoseError("TRACKING_LOST", "Tracker has not been initialized.")
        current = _gray(frame)
        try:
            forward, status_forward, _ = cv2.calcOpticalFlowPyrLK(self._gray, current, self._points, None)
            if forward is None or status_forward is None:
                return self._bad_state(current, 0, 0.0, float("inf"))
            backward, status_backward, _ = cv2.calcOpticalFlowPyrLK(current, self._gray, forward, None)
            if backward is None or status_backward is None:
                return self._bad_state(current, 0, 0.0, float("inf"))
            fb = np.linalg.norm(self._points.reshape(-1, 2) - backward.reshape(-1, 2), axis=1)
            valid = status_forward.reshape(-1).astype(bool) & status_backward.reshape(-1).astype(bool) & np.isfinite(fb) & (fb <= 1.5)
            old = self._points.reshape(-1, 2)[valid]
            new = forward.reshape(-1, 2)[valid]
            tracked = len(new)
            median = float(np.median(fb[valid])) if tracked else float("inf")
            if tracked < 12:
                return self._bad_state(current, tracked, 0.0, median)
            homography, mask = cv2.findHomography(old, new, cv2.RANSAC, 3.0)
            if homography is None or mask is None:
                return self._bad_state(current, tracked, 0.0, median)
            ratio = float(mask.mean())
            if ratio < 0.60 or median > 1.5:
                return self._bad_state(current, tracked, ratio, median)
            projected = cv2.perspectiveTransform(self._quad.astype(np.float32)[None, :, :], homography)[0].astype(np.float64)
            quad = validate_quad(projected, current.shape[1], current.shape[0])
        except (cv2.error, CameraPoseError):
            return self._bad_state(current, locals().get("tracked", 0), locals().get("ratio", 0.0), locals().get("median", float("inf")))
        self._gray = current
        self._points = new[mask.reshape(-1).astype(bool)].reshape(-1, 1, 2).astype(np.float32)
        self._quad = quad
        self._bad = 0
        self._pose = self._estimate(quad)
        return self._state("tracking", tracked, ratio, median)

    def _bad_state(self, current: NDArray[np.uint8], tracked: int, ratio: float, median: float) -> TrackingState:
        self._bad += 1
        if self._bad >= 3:
            self._lost = True
            self._pose = None
            return self._state("lost", tracked, ratio, median)
        return self._state("tracking", tracked, ratio, median)

    def _estimate(self, quad: NDArray[np.float64]) -> PoseEstimate | None:
        prior = None if self._pose is None else (self._pose.rotation_vector, self._pose.translation_m)
        try:
            return estimate_pose(self._object_points, quad, self._intrinsics, prior_pose=prior, live_mode=prior is not None)
        except CameraPoseError:
            return None

    def _state(self, status: Literal["tracking", "lost"], tracked: int, ratio: float, median: float) -> TrackingState:
        metrics = TrackingMetrics(int(tracked), float(ratio), float(median), self._bad)
        measurements = None
        if self._pose is not None and status == "tracking":
            pose = self._pose
            measurements = MeasurementReport(pose.perpendicular_distance_m, pose.target_center_distance_m, pose.horizontal_offset_m, pose.vertical_offset_m, None, pose.quality)
        return TrackingState(status, self._quad.copy(), self._pose if status == "tracking" else None, measurements, metrics)  # type: ignore[union-attr]


def _gray(frame: ArrayLike) -> NDArray[np.uint8]:
    values = np.asarray(frame)
    if values.ndim == 3 and values.shape[2] in (3, 4):
        values = cv2.cvtColor(values, cv2.COLOR_BGR2GRAY if values.shape[2] == 3 else cv2.COLOR_BGRA2GRAY)
    if values.ndim != 2 or values.size == 0:
        raise CameraPoseError("UNSUPPORTED_CAMERA")
    return np.clip(values, 0, 255).astype(np.uint8)
