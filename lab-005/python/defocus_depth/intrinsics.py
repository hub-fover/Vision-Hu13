from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field
from pathlib import Path

import cv2
import numpy as np

from .errors import DefocusDepthError
from .io import load_image, SUPPORTED_SUFFIXES


@dataclass
class CameraIntrinsics:
    matrix: np.ndarray
    distortion: np.ndarray
    image_size: tuple[int, int]
    rms_error: float = 0.0
    schema: str = "lab005.camera-intrinsics.v1"
    lens_id: str | None = None
    orientation: int = 1
    zoom: float | None = None
    calibration_metrics: dict = field(default_factory=dict)

    @property
    def fx(self) -> float:
        return float(self.matrix[0, 0])

    @property
    def fy(self) -> float:
        return float(self.matrix[1, 1])

    def to_dict(self) -> dict:
        result = {
            "schema": self.schema,
            "intrinsics": {
                "matrix": np.asarray(self.matrix, dtype=float).tolist(),
                "distortion": np.asarray(self.distortion, dtype=float).ravel().tolist(),
                "imageSize": list(self.image_size),
            },
            "rmsErrorPx": float(self.rms_error),
            "lensId": self.lens_id,
            "orientation": self.orientation,
            "zoom": self.zoom,
        }
        if self.calibration_metrics:
            result["calibrationMetrics"] = self.calibration_metrics
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "CameraIntrinsics":
        if data.get("schema") != "lab005.camera-intrinsics.v1":
            raise DefocusDepthError("INTRINSICS_MISMATCH")
        value = data.get("intrinsics", data)
        try:
            if "matrix" in value:
                matrix = np.asarray(value["matrix"], dtype=np.float64).reshape(3, 3)
            else:
                fx, fy = float(value["fx"]), float(value["fy"])
                cx, cy = float(value["cx"]), float(value["cy"])
                matrix = np.array([[fx, 0.0, cx], [0.0, fy, cy], [0.0, 0.0, 1.0]], dtype=np.float64)
            distortion = np.asarray(value.get("distortion", []), dtype=np.float64)
            image = value.get("imageSize", data.get("image"))
            if isinstance(image, dict):
                width, height = int(image["width"]), int(image["height"])
            else:
                width, height = map(int, image)
        except (KeyError, TypeError, ValueError) as exc:
            raise DefocusDepthError("INTRINSICS_MISMATCH") from exc
        if (
            not np.isfinite(matrix).all()
            or not np.isfinite(distortion).all()
            or matrix[0, 0] <= 0
            or matrix[1, 1] <= 0
            or width <= 0
            or height <= 0
        ):
            raise DefocusDepthError("INTRINSICS_MISMATCH")
        rms = data.get("rmsErrorPx", data.get("reprojectionRmsPx", 0.0))
        return cls(matrix, distortion, (width, height), float(rms), data["schema"], data.get("lensId"), int(data.get("orientation", 1)), data.get("zoom"), data.get("calibrationMetrics", {}))

    def validate_for_image(self, width: int, height: int, *, lens_id: str | None = None, orientation: int = 1, zoom: float | None = None) -> None:
        if self.image_size != (width, height) or self.orientation != orientation:
            raise DefocusDepthError("INTRINSICS_MISMATCH")
        if self.lens_id and lens_id and self.lens_id != lens_id:
            raise DefocusDepthError("INTRINSICS_MISMATCH")
        if self.zoom is not None and zoom is not None and abs(self.zoom - zoom) > 1e-3:
            raise DefocusDepthError("INTRINSICS_MISMATCH")

    def for_image(self, width: int, height: int) -> "CameraIntrinsics":
        source_width, source_height = self.image_size
        scale_x, scale_y = width / source_width, height / source_height
        if min(width, height, source_width, source_height) <= 0 or abs(scale_x - scale_y) > max(scale_x, scale_y) * 0.005:
            raise DefocusDepthError("INTRINSICS_MISMATCH")
        matrix = self.matrix.copy()
        matrix[0, :3] *= scale_x
        matrix[1, :3] *= scale_y
        return CameraIntrinsics(
            matrix, self.distortion.copy(), (width, height), self.rms_error,
            self.schema, self.lens_id, self.orientation, self.zoom, self.calibration_metrics.copy(),
        )


def undistort_stack(frames: list[np.ndarray] | tuple[np.ndarray, ...], camera: CameraIntrinsics) -> list[np.ndarray]:
    """Validate calibration compatibility and undistort every analysis frame."""
    corrected: list[np.ndarray] = []
    distortion = np.asarray(camera.distortion, dtype=np.float64).ravel()
    if distortion.size == 0:
        distortion = np.zeros(5, dtype=np.float64)
    for frame in frames:
        height, width = frame.shape[:2]
        compatible = camera.for_image(width, height)
        corrected.append(cv2.undistort(frame, compatible.matrix, distortion, None, compatible.matrix))
    return corrected


def calibrate_intrinsics(folder: str | Path, pattern: tuple[int, int] = (9, 6), square_size: float = 0.025) -> CameraIntrinsics:
    if len(pattern) != 2 or any(int(value) < 2 for value in pattern) or not np.isfinite(square_size) or square_size <= 0:
        raise DefocusDepthError("CALIBRATION_FAILED")
    folder = Path(folder)
    if not folder.is_dir():
        raise DefocusDepthError("CALIBRATION_FAILED")
    paths = sorted(p for p in folder.iterdir() if p.suffix.lower() in SUPPORTED_SUFFIXES)
    if not paths:
        raise DefocusDepthError("CALIBRATION_FAILED")
    object_points = np.zeros((pattern[0] * pattern[1], 3), np.float32)
    object_points[:, :2] = np.mgrid[0:pattern[0], 0:pattern[1]].T.reshape(-1, 2)
    object_points *= float(square_size)
    obj, img = [], []
    accepted_paths: list[str] = []
    rejected_paths: list[str] = []
    size = None
    for path in paths:
        image = load_image(path)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        current_size = (gray.shape[1], gray.shape[0])
        if size is not None and current_size != size:
            raise DefocusDepthError("INTRINSICS_MISMATCH")
        size = current_size
        found, corners = cv2.findChessboardCorners(gray, pattern, flags=cv2.CALIB_CB_ADAPTIVE_THRESH | cv2.CALIB_CB_NORMALIZE_IMAGE)
        if not found:
            rejected_paths.append(path.name)
            continue
        corners = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 1e-4))
        obj.append(object_points.copy()); img.append(corners)
        accepted_paths.append(path.name)
    if len(obj) < 3 or size is None:
        raise DefocusDepthError("CALIBRATION_FAILED")
    rms, matrix, distortion, rvecs, tvecs = cv2.calibrateCamera(obj, img, size, None, None)
    if not np.isfinite(rms) or rms < 0:
        raise DefocusDepthError("CALIBRATION_FAILED")
    per_view_errors = []
    for object_view, image_view, rvec, tvec in zip(obj, img, rvecs, tvecs):
        projected, _ = cv2.projectPoints(object_view, rvec, tvec, matrix, distortion)
        per_view_errors.append(float(np.sqrt(np.mean(np.sum((projected - image_view) ** 2, axis=2)))))
    metrics = {
        "viewsAccepted": len(accepted_paths),
        "viewsRejected": len(rejected_paths),
        "acceptedFiles": accepted_paths,
        "rejectedFiles": rejected_paths,
        "perViewReprojectionErrorPx": per_view_errors,
    }
    return CameraIntrinsics(matrix, distortion, size, rms_error=float(rms), calibration_metrics=metrics)
