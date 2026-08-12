"""Deterministic perturbation uncertainty for pose-derived distance."""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import ArrayLike

from .contracts import CameraIntrinsics, MeasurementInterval, Quality
from .errors import CameraPoseError
from .pose import estimate_pose


UNCERTAINTY_SAMPLES = 64
_RANDOM_SEED = 4004


def estimate_distance_interval(
    object_points_m: ArrayLike,
    image_points_px: ArrayLike,
    intrinsics: CameraIntrinsics,
    *,
    corner_sigma_px: float = 1.0,
    focal_sigma_fraction: float = 0.0,
    principal_point_sigma_px: float = 0.0,
) -> MeasurementInterval | None:
    """Return a deterministic central 90% target-center distance interval."""
    sigmas = (corner_sigma_px, focal_sigma_fraction, principal_point_sigma_px)
    if any(not math.isfinite(value) or value < 0 for value in sigmas):
        raise ValueError("Uncertainty standard deviations must be finite and nonnegative.")
    object_points = np.asarray(object_points_m, dtype=np.float64)
    image_points = np.asarray(image_points_px, dtype=np.float64)
    try:
        baseline = estimate_pose(object_points, image_points, intrinsics)
    except CameraPoseError:
        return None

    random = np.random.default_rng(_RANDOM_SEED)
    corner_noise = random.standard_normal((UNCERTAINTY_SAMPLES, 4, 2))
    focal_noise = random.standard_normal(UNCERTAINTY_SAMPLES)
    principal_noise = random.standard_normal((UNCERTAINTY_SAMPLES, 2))
    distances: list[float] = []
    for index in range(UNCERTAINTY_SAMPLES):
        perturbed_matrix = np.asarray(intrinsics.camera_matrix, dtype=np.float64).copy()
        focal_scale = 1.0 + focal_sigma_fraction * focal_noise[index]
        if focal_scale <= 0:
            continue
        perturbed_matrix[0, 0] *= focal_scale
        perturbed_matrix[1, 1] *= focal_scale
        perturbed_matrix[0, 2] += principal_point_sigma_px * principal_noise[index, 0]
        perturbed_matrix[1, 2] += principal_point_sigma_px * principal_noise[index, 1]
        perturbed_intrinsics = CameraIntrinsics(
            camera_matrix=perturbed_matrix,
            distortion=np.asarray(intrinsics.distortion, dtype=np.float64).copy(),
            image_size_px=intrinsics.image_size_px,
            source=intrinsics.source,
            estimation_method=intrinsics.estimation_method,
        )
        try:
            estimate = estimate_pose(
                object_points,
                image_points + corner_sigma_px * corner_noise[index],
                perturbed_intrinsics,
                prior_pose=(baseline.rotation_vector, baseline.translation_m),
                live_mode=True,
            )
        except CameraPoseError:
            continue
        distances.append(estimate.target_center_distance_m)

    if len(distances) < UNCERTAINTY_SAMPLES // 2:
        return None
    values = np.asarray(distances, dtype=np.float64)
    lower, median, upper = np.quantile(values, [0.05, 0.50, 0.95])
    return MeasurementInterval(
        median_m=float(median),
        lower_m=float(lower),
        upper_m=float(upper),
    )


def quality_with_uncertainty(
    pose_quality: Quality, interval: MeasurementInterval | None
) -> Quality:
    """Downgrade, but never upgrade, pose quality for a wide distance interval."""
    if interval is None or interval.median_m <= 0:
        return "unstable"
    relative_width = (interval.upper_m - interval.lower_m) / interval.median_m
    if relative_width > 0.25:
        return "unstable"
    if relative_width > 0.10 and pose_quality == "stable":
        return "reference-only"
    return pose_quality
