"""Constrained rectangle and checkerboard camera calibration."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

import cv2
import numpy as np
from numpy.typing import ArrayLike, NDArray

from .contracts import (
    CALIBRATION_SCHEMA,
    CalibrationMetrics,
    CalibrationResult,
    CameraIntrinsics,
)
from .errors import CameraPoseError
from .geometry import validate_quad


MIN_QUICK_VIEWS = 8
MIN_TARGET_AREA_FRACTION = 0.05
MIN_LAPLACIAN_VARIANCE = 50.0
MIN_GRAYSCALE_STDDEV = 12.0
MAX_CORNER_UNCERTAINTY_PX = 2.0
MIN_NORMAL_SPAN_DEG = 20.0
OBJECT_RECTANGLE_RELATIVE_TOLERANCE = 1e-4
_CALIBRATION_SOURCES = {
    "estimated",
    "quick-calibrated",
    "enhanced-calibrated",
}


@dataclass(frozen=True)
class CameraIdentity:
    camera_id: str
    lens_id: str
    zoom: float
    orientation: int
    image_size_px: tuple[int, int]
    crop_id: str = "full-frame"


@dataclass(frozen=True)
class CalibrationCapture:
    image: ArrayLike
    image_points_px: ArrayLike
    object_points_m: ArrayLike
    identity: CameraIdentity
    corner_uncertainty_px: float = 1.0
    name: str = "view"


@dataclass(frozen=True)
class CalibrationAssessment:
    name: str
    accepted: bool
    reason_code: str | None
    metrics: Mapping[str, float]


def assess_calibration_capture(capture: CalibrationCapture) -> CalibrationAssessment:
    """Apply deterministic per-view gates and return reasons without raising."""
    width, height = _identity_size(capture.identity)
    gray = _gray(capture.image)
    metrics: dict[str, float] = {
        "laplacianVariance": float(cv2.Laplacian(gray, cv2.CV_64F).var()),
        "grayscaleStddev": float(gray.std()),
        "cornerUncertaintyPx": float(capture.corner_uncertainty_px),
    }
    if (gray.shape[1], gray.shape[0]) != (width, height):
        return CalibrationAssessment(
            capture.name, False, "INTRINSICS_MISMATCH", metrics
        )
    try:
        quad = validate_quad(capture.image_points_px, width, height)
    except CameraPoseError as error:
        return CalibrationAssessment(capture.name, False, error.code, metrics)
    area = abs(float(cv2.contourArea(quad.astype(np.float32))))
    metrics["targetAreaFraction"] = area / (width * height)
    if metrics["targetAreaFraction"] < MIN_TARGET_AREA_FRACTION:
        return CalibrationAssessment(capture.name, False, "TARGET_TOO_SMALL", metrics)
    if metrics["laplacianVariance"] < MIN_LAPLACIAN_VARIANCE:
        return CalibrationAssessment(capture.name, False, "LOW_TEXTURE", metrics)
    if metrics["grayscaleStddev"] < MIN_GRAYSCALE_STDDEV:
        return CalibrationAssessment(capture.name, False, "LOW_CONTRAST", metrics)
    if (
        not math.isfinite(capture.corner_uncertainty_px)
        or capture.corner_uncertainty_px < 0
        or capture.corner_uncertainty_px > MAX_CORNER_UNCERTAINTY_PX
    ):
        return CalibrationAssessment(capture.name, False, "LOW_TEXTURE", metrics)
    try:
        _, object_width_m, object_height_m = _validate_object_rectangle(
            capture.object_points_m
        )
    except CameraPoseError as error:
        return CalibrationAssessment(capture.name, False, error.code, metrics)
    metrics["objectWidthM"] = object_width_m
    metrics["objectHeightM"] = object_height_m
    return CalibrationAssessment(capture.name, True, None, metrics)


def calibrate_quick(captures: Sequence[CalibrationCapture]) -> CalibrationResult:
    """Estimate one shared focal from diverse known planar rectangles."""
    if not captures:
        raise CameraPoseError("INSUFFICIENT_VIEW_DIVERSITY", "At least 8 accepted views are required.")
    identity = captures[0].identity
    _identity_size(identity)
    for capture in captures[1:]:
        _require_same_identity(identity, capture.identity)
    assessments = [assess_calibration_capture(capture) for capture in captures]
    accepted: list[CalibrationCapture] = []
    reference_points: NDArray[np.float64] | None = None
    reference_width = reference_height = reference_scale = 0.0
    for index, (capture, assessment) in enumerate(zip(captures, assessments)):
        if not assessment.accepted:
            continue
        points, width_m, height_m = _validate_object_rectangle(
            capture.object_points_m
        )
        if reference_points is None:
            reference_points = points
            reference_width, reference_height = width_m, height_m
            reference_scale = max(width_m, height_m)
            accepted.append(capture)
            continue
        consistent = (
            math.isclose(
                width_m,
                reference_width,
                rel_tol=OBJECT_RECTANGLE_RELATIVE_TOLERANCE,
            )
            and math.isclose(
                height_m,
                reference_height,
                rel_tol=OBJECT_RECTANGLE_RELATIVE_TOLERANCE,
            )
            and np.allclose(
                points,
                reference_points,
                rtol=OBJECT_RECTANGLE_RELATIVE_TOLERANCE,
                atol=OBJECT_RECTANGLE_RELATIVE_TOLERANCE * reference_scale,
            )
        )
        if consistent:
            accepted.append(capture)
            continue
        metrics = dict(assessment.metrics)
        metrics["objectWidthM"] = width_m
        metrics["objectHeightM"] = height_m
        assessments[index] = CalibrationAssessment(
            capture.name,
            False,
            "INVALID_DIMENSIONS",
            metrics,
        )
    if len(accepted) < MIN_QUICK_VIEWS:
        error = CameraPoseError(
            "INSUFFICIENT_VIEW_DIVERSITY",
            f"Need at least {MIN_QUICK_VIEWS} accepted views; got {len(accepted)}.",
        )
        error.assessments = assessments  # type: ignore[attr-defined]
        raise error

    width, height = identity.image_size_px
    object_points = [_object_points(item.object_points_m, expected=4).astype(np.float32) for item in accepted]
    image_points = [_image_points(item.image_points_px, expected=4).astype(np.float32) for item in accepted]
    initial = np.asarray(
        [[max(width, height), 0.0, width / 2], [0.0, max(width, height), height / 2], [0.0, 0.0, 1.0]],
        dtype=np.float64,
    )
    _require_diversity(object_points, image_points, initial, (width, height))
    output = _solve_quick(object_points, image_points, (width, height), initial)
    rms, matrix, distortion, rvecs, tvecs = output[:5]
    distortion = np.zeros(8, dtype=np.float64)
    standard_deviations = np.asarray(output[5], np.float64).reshape(-1)
    if (
        standard_deviations.size < 1
        or not np.isfinite(standard_deviations[0])
        or standard_deviations[0] > 0.5 * matrix[0, 0]
    ):
        raise CameraPoseError("CALIBRATION_FAILED", "Focal estimate is poorly conditioned.")
    reprojection_rms = _reprojection_rms(object_points, image_points, matrix, distortion, rvecs, tvecs)
    validation_rms = _held_out_rms(object_points, image_points, (width, height), initial)
    if max(reprojection_rms, validation_rms) / math.hypot(width, height) > 0.01:
        raise CameraPoseError("CALIBRATION_FAILED", "Held-out reprojection is unstable.")
    return CalibrationResult(
        schema=CALIBRATION_SCHEMA,
        intrinsics=CameraIntrinsics(matrix, distortion, (width, height), "quick-calibrated", "shared-focal-rectangles"),
        metrics=CalibrationMetrics(reprojection_rms, reprojection_rms / math.hypot(width, height), len(accepted)),
    )


def checkerboard_object_points(rows: int, columns: int, square_size_m: float) -> NDArray[np.float32]:
    if rows < 2 or columns < 2 or not math.isfinite(square_size_m) or square_size_m <= 0:
        raise CameraPoseError("INVALID_DIMENSIONS")
    points = np.zeros((rows * columns, 3), np.float32)
    points[:, :2] = np.mgrid[0:columns, 0:rows].T.reshape(-1, 2) * square_size_m
    return points


def calibrate_enhanced_checkerboard(
    images: Sequence[ArrayLike], rows: int, columns: int, square_size_m: float
) -> CalibrationResult:
    """Detect a declared checkerboard and estimate standard lens parameters."""
    board = checkerboard_object_points(rows, columns, square_size_m)
    object_points: list[NDArray[np.float32]] = []
    image_points: list[NDArray[np.float32]] = []
    image_size: tuple[int, int] | None = None
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
    for image in images:
        gray = _gray(image)
        current_size = (gray.shape[1], gray.shape[0])
        if image_size is None:
            image_size = current_size
        elif current_size != image_size:
            raise CameraPoseError("INTRINSICS_MISMATCH")
        found, corners = cv2.findChessboardCorners(gray, (columns, rows))
        if not found:
            continue
        refined = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), criteria)
        object_points.append(board.copy())
        image_points.append(np.asarray(refined, np.float32).reshape(-1, 2))
    if image_size is None or len(image_points) < MIN_QUICK_VIEWS:
        raise CameraPoseError("INSUFFICIENT_VIEW_DIVERSITY")
    flags = cv2.CALIB_FIX_K3 | cv2.CALIB_FIX_K4 | cv2.CALIB_FIX_K5 | cv2.CALIB_FIX_K6
    try:
        rms, matrix, distortion, rvecs, tvecs = cv2.calibrateCamera(
            object_points, image_points, image_size, None, None, flags=flags
        )
    except cv2.error as error:
        raise CameraPoseError("CALIBRATION_FAILED") from error
    distortion = np.asarray(distortion, np.float64).reshape(-1)[:5]
    try:
        _validate_solution(matrix, distortion, rms, *image_size)
    except CameraPoseError as error:
        raise CameraPoseError("CALIBRATION_FAILED") from error
    reprojection_rms = _reprojection_rms(object_points, image_points, matrix, distortion, rvecs, tvecs)
    return CalibrationResult(
        CALIBRATION_SCHEMA,
        CameraIntrinsics(matrix, distortion, image_size, "enhanced-calibrated", "checkerboard"),
        CalibrationMetrics(reprojection_rms, reprojection_rms / math.hypot(*image_size), len(image_points)),
    )


def save_calibration(result: CalibrationResult, path: str | Path, identity: CameraIdentity) -> None:
    """Write canonical, finite calibration JSON."""
    _identity_size(identity)
    if result.intrinsics.source not in _CALIBRATION_SOURCES:
        raise CameraPoseError("INVALID_CALIBRATION_FILE")
    if result.intrinsics.image_size_px != identity.image_size_px:
        raise CameraPoseError("INTRINSICS_MISMATCH")
    _validate_solution(
        np.asarray(result.intrinsics.camera_matrix), np.asarray(result.intrinsics.distortion),
        result.metrics.rms_px, *result.intrinsics.image_size_px,
    )
    _validate_metrics(result.metrics, result.intrinsics.image_size_px)
    payload = {
        "identity": _identity_json(identity),
        "intrinsics": {
            "cameraMatrix": np.asarray(result.intrinsics.camera_matrix, dtype=float).tolist(),
            "distortion": np.asarray(result.intrinsics.distortion, dtype=float).reshape(-1).tolist(),
            "estimationMethod": result.intrinsics.estimation_method,
            "imageSizePx": list(result.intrinsics.image_size_px),
            "source": result.intrinsics.source,
        },
        "metrics": {
            "acceptedViews": result.metrics.accepted_views,
            "normalizedRms": result.metrics.normalized_rms,
            "rmsPx": result.metrics.rms_px,
        },
        "schema": CALIBRATION_SCHEMA,
    }
    try:
        Path(path).write_text(json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
    except (OSError, TypeError, ValueError) as error:
        raise CameraPoseError("INVALID_CALIBRATION_FILE") from error


def load_calibration(path: str | Path, identity: CameraIdentity) -> CalibrationResult:
    """Load calibration, enforcing camera identity and exact-aspect scaling."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
        if data["schema"] != CALIBRATION_SCHEMA:
            raise ValueError("schema")
        stored_identity = _identity_from_json(data["identity"])
        _validate_loaded_identity(stored_identity)
        intrinsics_data = data["intrinsics"]
        matrix = np.asarray(intrinsics_data["cameraMatrix"], np.float64)
        distortion = np.asarray(intrinsics_data["distortion"], np.float64).reshape(-1)
        old_size = _json_image_size(intrinsics_data["imageSizePx"])
        source = intrinsics_data["source"]
        if source not in _CALIBRATION_SOURCES:
            raise ValueError("source")
        metrics_data = data["metrics"]
        accepted_views = metrics_data["acceptedViews"]
        if type(accepted_views) is not int:
            raise ValueError("acceptedViews")
        metrics = CalibrationMetrics(
            float(metrics_data["rmsPx"]),
            float(metrics_data["normalizedRms"]),
            accepted_views,
        )
        _validate_solution(matrix, distortion, metrics.rms_px, *old_size)
        _validate_metrics(metrics, old_size)
    except CameraPoseError:
        raise
    except (OSError, KeyError, TypeError, ValueError, OverflowError, json.JSONDecodeError) as error:
        raise CameraPoseError("INVALID_CALIBRATION_FILE") from error
    _require_same_camera(stored_identity, identity)
    new_size = _identity_size(identity)
    if stored_identity.crop_id != identity.crop_id:
        raise CameraPoseError("INTRINSICS_MISMATCH")
    if old_size != stored_identity.image_size_px:
        raise CameraPoseError("INVALID_CALIBRATION_FILE")
    if old_size[0] * new_size[1] != old_size[1] * new_size[0]:
        raise CameraPoseError("INTRINSICS_MISMATCH")
    scale = new_size[0] / old_size[0]
    scaled = matrix.copy()
    scaled[0, :] *= scale
    scaled[1, :] *= scale
    scaled[2, :] = [0.0, 0.0, 1.0]
    return CalibrationResult(
        CALIBRATION_SCHEMA,
        CameraIntrinsics(scaled, distortion.copy(), new_size, source, intrinsics_data.get("estimationMethod")),
        metrics,
    )


def _gray(image: ArrayLike) -> NDArray[np.uint8]:
    values = np.asarray(image)
    if values.ndim == 3 and values.shape[2] in (3, 4):
        values = cv2.cvtColor(values, cv2.COLOR_RGB2GRAY if values.shape[2] == 3 else cv2.COLOR_RGBA2GRAY)
    if values.ndim != 2 or values.size == 0 or not np.isfinite(values).all():
        raise CameraPoseError("UNSUPPORTED_CAMERA")
    return np.clip(values, 0, 255).astype(np.uint8)


def _image_points(value: ArrayLike, expected: int) -> NDArray[np.float64]:
    points = np.asarray(value, np.float64)
    if points.shape != (expected, 2) or not np.isfinite(points).all():
        raise CameraPoseError("INVALID_QUAD")
    return points


def _object_points(value: ArrayLike, expected: int) -> NDArray[np.float64]:
    points = np.asarray(value, np.float64)
    if points.shape != (expected, 3) or not np.isfinite(points).all():
        raise CameraPoseError("INVALID_DIMENSIONS")
    return points


def _validate_object_rectangle(
    value: ArrayLike,
) -> tuple[NDArray[np.float64], float, float]:
    """Validate TL,TR,BR,BL object points within a 1e-4 relative tolerance."""
    points = _object_points(value, expected=4)
    scale = max(
        float(np.ptp(points[:, 0])),
        float(np.ptp(points[:, 1])),
        np.finfo(np.float64).eps,
    )
    absolute_tolerance = OBJECT_RECTANGLE_RELATIVE_TOLERANCE * scale
    if (
        np.ptp(points[:, 2]) > absolute_tolerance
        or np.max(np.abs(points[:, 2])) > absolute_tolerance
    ):
        raise CameraPoseError("INVALID_DIMENSIONS", "Object points must lie on z=0.")

    planar = points[:, :2]
    distances = np.asarray(
        [
            np.linalg.norm(planar[first] - planar[second])
            for first in range(4)
            for second in range(first + 1, 4)
        ],
        dtype=np.float64,
    )
    if float(distances.min()) <= absolute_tolerance:
        raise CameraPoseError("INVALID_QUAD", "Object corners must be unique.")

    edges = np.roll(planar, -1, axis=0) - planar
    lengths = np.linalg.norm(edges, axis=1)
    if (
        np.any(lengths <= absolute_tolerance)
        or not math.isclose(
            float(lengths[0]),
            float(lengths[2]),
            rel_tol=OBJECT_RECTANGLE_RELATIVE_TOLERANCE,
        )
        or not math.isclose(
            float(lengths[1]),
            float(lengths[3]),
            rel_tol=OBJECT_RECTANGLE_RELATIVE_TOLERANCE,
        )
    ):
        raise CameraPoseError("INVALID_QUAD", "Object edge cycle is not rectangular.")
    for index in range(4):
        adjacent = float(np.dot(edges[index], edges[(index + 1) % 4]))
        if abs(adjacent) > (
            OBJECT_RECTANGLE_RELATIVE_TOLERANCE
            * lengths[index]
            * lengths[(index + 1) % 4]
        ):
            raise CameraPoseError("INVALID_QUAD", "Object edges are not perpendicular.")
    following = np.roll(edges, -1, axis=0)
    crosses = edges[:, 0] * following[:, 1] - edges[:, 1] * following[:, 0]
    if not (np.all(crosses > 0) or np.all(crosses < 0)):
        raise CameraPoseError("INVALID_QUAD", "Object corner order is invalid.")
    return points, float(lengths[0]), float(lengths[1])


def _identity_size(identity: CameraIdentity) -> tuple[int, int]:
    width, height = identity.image_size_px
    if not identity.camera_id or not identity.lens_id or not identity.crop_id or identity.orientation not in range(1, 9) or width <= 0 or height <= 0 or not math.isfinite(identity.zoom) or identity.zoom <= 0:
        raise CameraPoseError("INVALID_DIMENSIONS")
    return width, height


def _require_same_camera(expected: CameraIdentity, actual: CameraIdentity) -> None:
    if (expected.camera_id, expected.lens_id, expected.zoom, expected.orientation) != (actual.camera_id, actual.lens_id, actual.zoom, actual.orientation):
        raise CameraPoseError("CAMERA_CHANGED")


def _require_same_identity(expected: CameraIdentity, actual: CameraIdentity) -> None:
    _require_same_camera(expected, actual)
    if expected.image_size_px != actual.image_size_px or expected.crop_id != actual.crop_id:
        raise CameraPoseError("INTRINSICS_MISMATCH")


def _require_diversity(object_points: Sequence[NDArray], image_points: Sequence[NDArray], matrix: NDArray, size: tuple[int, int]) -> None:
    normals: list[NDArray[np.float64]] = []
    centers = []
    for obj, image in zip(object_points, image_points):
        try:
            solved, rvec, _ = cv2.solvePnP(
                obj, image, matrix, np.zeros(8), flags=cv2.SOLVEPNP_IPPE
            )
        except cv2.error as error:
            raise CameraPoseError("INVALID_QUAD") from error
        if solved:
            normals.append(cv2.Rodrigues(rvec)[0][:, 2])
        centers.append(np.mean(image, axis=0) / np.asarray(size))
    span = max((math.degrees(math.acos(float(np.clip(np.dot(a, b), -1, 1)))) for a in normals for b in normals), default=0.0)
    center_span = float(np.ptp(np.asarray(centers), axis=0).max())
    if span < MIN_NORMAL_SPAN_DEG or center_span < 0.05:
        raise CameraPoseError("INSUFFICIENT_VIEW_DIVERSITY")


def _validate_solution(matrix: NDArray, distortion: NDArray, rms: float, width: int, height: int) -> None:
    if matrix.shape != (3, 3) or distortion.ndim != 1 or distortion.size not in range(4, 15) or not np.isfinite(matrix).all() or not np.isfinite(distortion).all() or not math.isfinite(float(rms)) or rms < 0:
        raise CameraPoseError("INVALID_CALIBRATION_FILE")
    fx, fy, cx, cy = matrix[0, 0], matrix[1, 1], matrix[0, 2], matrix[1, 2]
    if (
        fx <= 0
        or fy <= 0
        or fx > 100 * width
        or fy > 100 * height
        or not (0 <= cx <= width)
        or not (0 <= cy <= height)
        or not np.allclose(matrix[2], [0, 0, 1])
        or not np.allclose([matrix[0, 1], matrix[1, 0]], 0.0)
        or np.max(np.abs(distortion)) > 10.0
    ):
        raise CameraPoseError("INVALID_CALIBRATION_FILE")


def _validate_metrics(metrics: CalibrationMetrics, size: tuple[int, int]) -> None:
    if (
        type(metrics.accepted_views) is not int
        or metrics.accepted_views < 1
        or not math.isfinite(metrics.normalized_rms)
        or metrics.normalized_rms < 0
        or not math.isclose(
            metrics.normalized_rms,
            metrics.rms_px / math.hypot(*size),
            rel_tol=1e-6,
            abs_tol=1e-12,
        )
    ):
        raise CameraPoseError("INVALID_CALIBRATION_FILE")


def _reprojection_rms(object_points: Sequence[NDArray], image_points: Sequence[NDArray], matrix: NDArray, distortion: NDArray, rvecs: Sequence[NDArray], tvecs: Sequence[NDArray]) -> float:
    squared: list[float] = []
    for obj, image, rvec, tvec in zip(object_points, image_points, rvecs, tvecs):
        projected = cv2.projectPoints(obj, rvec, tvec, matrix, distortion)[0].reshape(-1, 2)
        squared.extend(np.sum((projected - image) ** 2, axis=1).tolist())
    return math.sqrt(float(np.mean(squared)))


def _solve_quick(
    object_points: Sequence[NDArray],
    image_points: Sequence[NDArray],
    size: tuple[int, int],
    initial: NDArray[np.float64],
) -> tuple[object, ...]:
    flags = (
        cv2.CALIB_USE_INTRINSIC_GUESS
        | cv2.CALIB_FIX_ASPECT_RATIO
        | cv2.CALIB_FIX_PRINCIPAL_POINT
        | cv2.CALIB_ZERO_TANGENT_DIST
        | cv2.CALIB_FIX_K1
        | cv2.CALIB_FIX_K2
        | cv2.CALIB_FIX_K3
        | cv2.CALIB_FIX_K4
        | cv2.CALIB_FIX_K5
        | cv2.CALIB_FIX_K6
    )
    try:
        output = cv2.calibrateCameraExtended(
            object_points,
            image_points,
            size,
            initial.copy(),
            np.zeros(8),
            flags=flags,
        )
        _validate_solution(
            np.asarray(output[1]), np.zeros(8), float(output[0]), *size
        )
        if len(output[3]) != len(object_points) or len(output[4]) != len(object_points):
            raise ValueError("extrinsics")
        return output
    except (cv2.error, CameraPoseError, TypeError, ValueError, IndexError) as error:
        raise CameraPoseError("CALIBRATION_FAILED") from error


def _held_out_rms(
    object_points: Sequence[NDArray],
    image_points: Sequence[NDArray],
    size: tuple[int, int],
    initial: NDArray[np.float64],
) -> float:
    holdout_count = max(1, len(object_points) // 5)
    holdout = set(
        np.linspace(0, len(object_points) - 1, holdout_count + 2, dtype=int)[1:-1].tolist()
    )
    training_object = [value for index, value in enumerate(object_points) if index not in holdout]
    training_image = [value for index, value in enumerate(image_points) if index not in holdout]
    output = _solve_quick(training_object, training_image, size, initial)
    matrix = np.asarray(output[1], np.float64)
    distortion = np.zeros(8)
    squared: list[float] = []
    for index in sorted(holdout):
        solved, rvec, tvec = cv2.solvePnP(
            object_points[index], image_points[index], matrix, distortion, flags=cv2.SOLVEPNP_IPPE
        )
        if not solved:
            raise CameraPoseError("CALIBRATION_FAILED")
        projected = cv2.projectPoints(object_points[index], rvec, tvec, matrix, distortion)[0].reshape(-1, 2)
        squared.extend(np.sum((projected - image_points[index]) ** 2, axis=1).tolist())
    return math.sqrt(float(np.mean(squared)))


def _identity_json(identity: CameraIdentity) -> dict[str, object]:
    return {"cameraId": identity.camera_id, "cropId": identity.crop_id, "imageSizePx": list(identity.image_size_px), "lensId": identity.lens_id, "orientation": identity.orientation, "zoom": identity.zoom}


def _identity_from_json(data: Mapping[str, object]) -> CameraIdentity:
    size = _json_image_size(data["imageSizePx"])
    return CameraIdentity(str(data["cameraId"]), str(data["lensId"]), float(data["zoom"]), int(data["orientation"]), size, str(data.get("cropId", "full-frame")))


def _json_image_size(value: object) -> tuple[int, int]:
    values = np.asarray(value, np.float64)
    if (
        values.shape != (2,)
        or not np.isfinite(values).all()
        or np.any(values <= 0)
        or np.any(values != np.floor(values))
    ):
        raise ValueError("imageSizePx")
    return int(values[0]), int(values[1])


def _validate_loaded_identity(identity: CameraIdentity) -> None:
    width, height = identity.image_size_px
    if (
        not identity.camera_id
        or not identity.lens_id
        or not identity.crop_id
        or identity.orientation not in range(1, 9)
        or width <= 0
        or height <= 0
        or not math.isfinite(identity.zoom)
        or identity.zoom <= 0
    ):
        raise ValueError("identity")
