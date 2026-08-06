"""Planar IPPE pose estimation and camera-center measurements."""

from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import ArrayLike, NDArray

from .contracts import (
    REFERENCE_ONLY_MAX_NORMALIZED_RMS,
    STABLE_MAX_NORMALIZED_RMS,
    CameraIntrinsics,
    PoseEstimate,
    Quality,
)
from .errors import CameraPoseError


@dataclass(frozen=True)
class _Candidate:
    rotation_vector: NDArray[np.float64]
    translation: NDArray[np.float64]
    rotation_matrix: NDArray[np.float64]
    rms_px: float
    normalized_rms: float
    quality: Quality


def quality_from_normalized_rms(normalized_rms: float) -> Quality:
    """Apply the fixed LAB 004 normalized reprojection RMS thresholds."""
    if math.isfinite(normalized_rms) and normalized_rms <= STABLE_MAX_NORMALIZED_RMS:
        return "stable"
    if (
        math.isfinite(normalized_rms)
        and normalized_rms <= REFERENCE_ONLY_MAX_NORMALIZED_RMS
    ):
        return "reference-only"
    return "unstable"


def decompose_euler_zyx(rotation_matrix: ArrayLike) -> tuple[float, float, float]:
    """Return (z, y, x) where ``R = Rz(z) @ Ry(y) @ Rx(x)``."""
    rotation = np.asarray(rotation_matrix, dtype=np.float64)
    if rotation.shape != (3, 3) or not np.isfinite(rotation).all():
        raise CameraPoseError("POSE_FAILED", "Rotation matrix is invalid.")
    y = math.asin(float(np.clip(-rotation[2, 0], -1.0, 1.0)))
    if abs(math.cos(y)) > 1e-9:
        x = math.atan2(float(rotation[2, 1]), float(rotation[2, 2]))
        z = math.atan2(float(rotation[1, 0]), float(rotation[0, 0]))
    else:
        x = 0.0
        z = math.atan2(float(-rotation[0, 1]), float(rotation[1, 1]))
    return z, y, x


def estimate_pose(
    object_points_m: ArrayLike,
    image_points_px: ArrayLike,
    intrinsics: CameraIntrinsics,
    *,
    prior_pose: tuple[ArrayLike, ArrayLike] | None = None,
    live_mode: bool = False,
) -> PoseEstimate:
    """Estimate an object-to-camera pose using generic planar IPPE."""
    object_points = _points(object_points_m, (4, 3))
    image_points = _points(image_points_px, (4, 2))
    camera_matrix = np.asarray(intrinsics.camera_matrix, dtype=np.float64)
    distortion = np.asarray(intrinsics.distortion, dtype=np.float64)
    if camera_matrix.shape != (3, 3) or not np.isfinite(camera_matrix).all():
        raise CameraPoseError("INTRINSICS_MISMATCH")
    width, height = intrinsics.image_size_px
    if width <= 0 or height <= 0 or not np.isfinite(distortion).all():
        raise CameraPoseError("INTRINSICS_MISMATCH")

    try:
        solved, rotation_vectors, translations, _ = cv2.solvePnPGeneric(
            object_points,
            image_points,
            camera_matrix,
            distortion,
            flags=cv2.SOLVEPNP_IPPE,
        )
    except cv2.error as error:
        raise CameraPoseError("POSE_FAILED") from error
    if not solved:
        raise CameraPoseError("POSE_FAILED")

    image_diagonal = math.hypot(width, height)
    candidates = [
        candidate
        for rotation_vector, translation in zip(rotation_vectors, translations)
        if (candidate := _candidate(
            object_points,
            image_points,
            camera_matrix,
            distortion,
            rotation_vector,
            translation,
            image_diagonal,
        ))
        is not None
    ]
    if not candidates:
        raise CameraPoseError("POSE_FAILED", "IPPE produced no physical pose.")
    candidates.sort(key=lambda value: value.rms_px)
    best = candidates[0]
    if best.quality == "unstable":
        raise CameraPoseError("HIGH_REPROJECTION_ERROR")

    similarly_plausible = [value for value in candidates if value.quality == best.quality]
    if len(similarly_plausible) > 1:
        if not live_mode or prior_pose is None:
            raise CameraPoseError("POSE_AMBIGUOUS")
        best = min(similarly_plausible, key=lambda value: _continuity_cost(value, prior_pose))

    try:
        refined_rotation, refined_translation = cv2.solvePnPRefineLM(
            object_points,
            image_points,
            camera_matrix,
            distortion,
            best.rotation_vector.copy(),
            best.translation.copy(),
        )
    except cv2.error as error:
        raise CameraPoseError("POSE_FAILED", "Pose refinement failed.") from error
    refined = _candidate(
        object_points,
        image_points,
        camera_matrix,
        distortion,
        refined_rotation,
        refined_translation,
        image_diagonal,
    )
    if refined is None:
        raise CameraPoseError("POSE_FAILED", "Refined pose is not physical.")
    if refined.quality == "unstable":
        raise CameraPoseError("HIGH_REPROJECTION_ERROR")

    camera_center = -refined.rotation_matrix.T @ refined.translation
    return PoseEstimate(
        rotation_matrix=refined.rotation_matrix,
        rotation_vector=refined.rotation_vector,
        translation_m=refined.translation,
        camera_center_m=camera_center,
        euler_zyx_rad=decompose_euler_zyx(refined.rotation_matrix),
        perpendicular_distance_m=float(camera_center[2]),
        target_center_distance_m=float(np.linalg.norm(camera_center)),
        horizontal_offset_m=float(camera_center[0]),
        vertical_offset_m=float(camera_center[1]),
        reprojection_rms_px=refined.rms_px,
        normalized_rms=refined.normalized_rms,
        quality=refined.quality,
    )


def _candidate(
    object_points: NDArray[np.float64],
    image_points: NDArray[np.float64],
    camera_matrix: NDArray[np.float64],
    distortion: NDArray[np.float64],
    rotation_vector: ArrayLike,
    translation: ArrayLike,
    image_diagonal: float,
) -> _Candidate | None:
    rvec = np.asarray(rotation_vector, dtype=np.float64).reshape(-1)
    tvec = np.asarray(translation, dtype=np.float64).reshape(-1)
    if rvec.shape != (3,) or tvec.shape != (3,) or not np.isfinite(rvec).all() or not np.isfinite(tvec).all():
        return None
    try:
        rotation = cv2.Rodrigues(rvec)[0]
        projected = cv2.projectPoints(
            object_points, rvec, tvec, camera_matrix, distortion
        )[0].reshape(-1, 2)
    except cv2.error:
        return None
    camera_points = (rotation @ object_points.T).T + tvec
    camera_center = -rotation.T @ tvec
    if (
        not np.isfinite(rotation).all()
        or not np.isfinite(projected).all()
        or np.any(camera_points[:, 2] <= 1e-9)
        or camera_center[2] <= 1e-9
    ):
        return None
    rms = math.sqrt(float(np.mean(np.sum((projected - image_points) ** 2, axis=1))))
    normalized = rms / image_diagonal
    return _Candidate(
        rotation_vector=rvec,
        translation=tvec,
        rotation_matrix=rotation,
        rms_px=rms,
        normalized_rms=normalized,
        quality=quality_from_normalized_rms(normalized),
    )


def _continuity_cost(candidate: _Candidate, prior_pose: tuple[ArrayLike, ArrayLike]) -> float:
    prior_rotation_vector = np.asarray(prior_pose[0], dtype=np.float64).reshape(3)
    prior_translation = np.asarray(prior_pose[1], dtype=np.float64).reshape(3)
    prior_rotation = cv2.Rodrigues(prior_rotation_vector)[0]
    relative = prior_rotation.T @ candidate.rotation_matrix
    cosine = float(np.clip((np.trace(relative) - 1.0) / 2.0, -1.0, 1.0))
    angle = math.acos(cosine)
    translation_scale = max(float(np.linalg.norm(prior_translation)), 1e-9)
    return angle + float(np.linalg.norm(candidate.translation - prior_translation)) / translation_scale


def _points(value: ArrayLike, shape: tuple[int, int]) -> NDArray[np.float64]:
    try:
        result = np.asarray(value, dtype=np.float64)
    except (TypeError, ValueError, OverflowError) as error:
        raise CameraPoseError("POSE_FAILED") from error
    if result.shape != shape or not np.isfinite(result).all():
        raise CameraPoseError("POSE_FAILED")
    return result
