from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .errors import DefocusDepthError
from .intrinsics import CameraIntrinsics


@dataclass
class FocusDepthScale:
    focus_indices: np.ndarray
    distances_m: np.ndarray
    residual_m: float = 0.0
    schema: str = "lab005.focus-depth-scale.v1"
    source_frame_count: int | None = None
    focus_curves: list[list[float]] | None = None
    intrinsics_schema: str | None = None
    image_size: tuple[int, int] | None = None
    lens_id: str | None = None
    orientation: int | None = None
    zoom: float | None = None

    def distance_for_focus(self, focus: np.ndarray | float) -> np.ndarray:
        values = np.asarray(focus, dtype=np.float64)
        result = np.interp(values, self.focus_indices, self.distances_m)
        return result.astype(np.float64)

    def to_dict(self) -> dict:
        result = {
            "schema": self.schema,
            "focusIndices": self.focus_indices.astype(float).tolist(),
            "distancesM": self.distances_m.astype(float).tolist(),
            "residualM": float(self.residual_m),
        }
        if self.source_frame_count is not None:
            result["sourceFrameCount"] = int(self.source_frame_count)
        if self.focus_curves is not None:
            result["focusCurves"] = self.focus_curves
        if self.intrinsics_schema is not None:
            result["intrinsicsSchema"] = self.intrinsics_schema
        if self.image_size is not None:
            result["imageSize"] = list(self.image_size)
        if self.lens_id is not None:
            result["lensId"] = self.lens_id
        if self.orientation is not None:
            result["orientation"] = int(self.orientation)
        if self.zoom is not None:
            result["zoom"] = float(self.zoom)
        return result

    def bind_camera(self, camera: CameraIntrinsics) -> "FocusDepthScale":
        self.intrinsics_schema = camera.schema
        self.image_size = camera.image_size
        self.lens_id = camera.lens_id
        self.orientation = camera.orientation
        self.zoom = camera.zoom
        return self

    def validate_for_camera(self, camera: CameraIntrinsics) -> None:
        if self.intrinsics_schema != camera.schema or self.image_size != camera.image_size:
            raise DefocusDepthError("INTRINSICS_MISMATCH")
        for expected, actual in ((self.lens_id, camera.lens_id), (self.orientation, camera.orientation), (self.zoom, camera.zoom)):
            if expected is not None and actual is not None and str(expected) != str(actual):
                raise DefocusDepthError("INTRINSICS_MISMATCH")

    @classmethod
    def from_dict(cls, data: dict) -> "FocusDepthScale":
        if data.get("schema") != "lab005.focus-depth-scale.v1":
            raise DefocusDepthError("DEPTH_SCALE_UNCALIBRATED")
        try:
            if "focusIndices" in data and "distancesM" in data:
                focus = np.asarray(data["focusIndices"], dtype=np.float64).ravel()
                distance = np.asarray(data["distancesM"], dtype=np.float64).ravel()
            else:
                samples = sorted(data["samples"], key=lambda sample: float(sample["focus"]))
                focus = np.asarray([sample["focus"] for sample in samples], dtype=np.float64).ravel()
                distance = np.asarray([sample["distance"] for sample in samples], dtype=np.float64).ravel()
        except (KeyError, TypeError, ValueError) as exc:
            raise DefocusDepthError("DEPTH_SCALE_UNCALIBRATED") from exc
        if (
            focus.size < 2 or focus.size != distance.size
            or not np.isfinite(focus).all() or not np.isfinite(distance).all()
            or np.any(np.diff(focus) <= 0) or np.any(distance <= 0)
        ):
            raise DefocusDepthError("DEPTH_SCALE_UNCALIBRATED")
        distance_deltas = np.diff(distance)
        if not (np.all(distance_deltas >= 0) or np.all(distance_deltas <= 0)):
            raise DefocusDepthError("DEPTH_SCALE_UNCALIBRATED")
        return cls(
            focus, distance, float(data.get("residualM", 0.0)),
            source_frame_count=data.get("sourceFrameCount"),
            focus_curves=data.get("focusCurves"),
            intrinsics_schema=data.get("intrinsicsSchema"),
            image_size=tuple(map(int, data["imageSize"])) if data.get("imageSize") else None,
            lens_id=data.get("lensId"),
            orientation=int(data["orientation"]) if data.get("orientation") is not None else None,
            zoom=float(data["zoom"]) if data.get("zoom") is not None else None,
        )


def calibrate_scale(focus_indices: list[float] | np.ndarray, distances_m: list[float] | np.ndarray) -> FocusDepthScale:
    focus = np.asarray(focus_indices, dtype=np.float64).ravel()
    distance = np.asarray(distances_m, dtype=np.float64).ravel()
    if focus.size < 3 or focus.size != distance.size or not np.isfinite(focus).all() or not np.isfinite(distance).all():
        raise DefocusDepthError("CALIBRATION_FAILED")
    order = np.argsort(focus)
    focus, distance = focus[order], distance[order]
    if np.any(np.diff(focus) <= 0) or np.any(distance <= 0):
        raise DefocusDepthError("CALIBRATION_FAILED")
    diffs = np.diff(distance)
    if not (np.all(diffs >= 0) or np.all(diffs <= 0)):
        raise DefocusDepthError("CALIBRATION_FAILED", "Distance mapping must be monotonic.")
    # The mapping remains piecewise linear. RMSE against its best linear trend
    # reports how nonlinear the three calibration samples are.
    slope, intercept = np.polyfit(focus, distance, 1)
    fitted = slope * focus + intercept
    residual = float(np.sqrt(np.mean((fitted - distance) ** 2)))
    return FocusDepthScale(focus, distance, residual)


def _scale_groups(folder: Path) -> list[list[np.ndarray]]:
    from .io import SUPPORTED_SUFFIXES, load_image, load_stack, validate_stack

    if not folder.is_dir():
        raise DefocusDepthError("CALIBRATION_FAILED", "Scale calibration folder does not exist.")
    directories = sorted(path for path in folder.iterdir() if path.is_dir())
    groups = [load_stack(path) for path in directories if any(item.suffix.lower() in SUPPORTED_SUFFIXES for item in path.iterdir())]
    if groups:
        if len(groups) != 3:
            raise DefocusDepthError("CALIBRATION_FAILED", "Scale calibration requires three five-frame folders.")
        return groups
    paths = sorted(path for path in folder.iterdir() if path.suffix.lower() in SUPPORTED_SUFFIXES)
    if len(paths) != 15:
        raise DefocusDepthError("CALIBRATION_FAILED", "Scale calibration requires exactly 15 frames.")
    return [list(validate_stack([load_image(path) for path in paths[start:start + 5]])) for start in range(0, 15, 5)]


def calibrate_scale_from_folder(folder: str | Path, distances_m: list[float] | np.ndarray, camera: CameraIntrinsics | None = None) -> FocusDepthScale:
    """Measure the sharpest sweep position for three known-distance stacks."""
    from .alignment import align_stack
    from .depth import quadratic_peak
    from .focus_metrics import focus_curve

    groups = _scale_groups(Path(folder))
    curves: list[list[float]] = []
    focus_indices: list[float] = []
    for frames in groups:
        if camera is not None:
            from .intrinsics import undistort_stack
            frames = undistort_stack(frames, camera)
        try:
            aligned_frames = align_stack(frames).frames
        except DefocusDepthError as exc:
            if exc.code != "ALIGNMENT_FAILED":
                raise
            # Strong defocus can remove ORB descriptors even on a static tripod.
            # Phase correlation still rejects meaningful translation before the
            # raw stack is accepted for calibration.
            raw_curve = focus_curve(frames)
            reference = frames[int(np.argmax(raw_curve))]
            reference_gray = reference if reference.ndim == 2 else cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
            reference_gray = reference_gray.astype(np.float32)
            for frame in frames:
                gray = frame if frame.ndim == 2 else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                shift, _ = cv2.phaseCorrelate(reference_gray, gray.astype(np.float32))
                # Very blurred endpoints make phase correlation noisy by a few
                # pixels; four pixels at the 1280px analysis scale is still a
                # strict guard against a handheld reframe.
                if np.linalg.norm(shift) > 4.0:
                    raise DefocusDepthError("CAMERA_MOVED") from exc
            aligned_frames = frames
        curve = focus_curve(aligned_frames)
        peak, _ = quadratic_peak(curve)
        curves.append(curve.astype(float).tolist())
        focus_indices.append(float(np.clip(peak / 4.0, 0.0, 1.0)))
    result = calibrate_scale(focus_indices, distances_m)
    result.source_frame_count = sum(len(group) for group in groups)
    # Reorder diagnostics into the same focus order as the serialised samples.
    result.focus_curves = [curves[index] for index in np.argsort(focus_indices)]
    if camera is not None:
        result.bind_camera(camera)
    return result
