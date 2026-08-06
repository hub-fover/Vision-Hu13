"""Command-line calibration, still estimation, and live tracking."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import ArrayLike, NDArray

from .calibration import (
    CalibrationCapture,
    CameraIdentity,
    assess_calibration_capture,
    calibrate_quick,
    load_calibration,
    save_calibration,
)
from .debug import DebugWriter
from .errors import CameraPoseError
from .geometry import plane_object_points, validate_quad
from .io import AnalysisImage, estimate_uncalibrated_intrinsics, load_analysis_image
from .pose import estimate_pose
from .contracts import PlaneTarget
from .tracking import PlanarTracker


CornerCollector = Callable[[NDArray[np.uint8], Sequence[str]], ArrayLike | None]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m camera_pose")
    commands = parser.add_subparsers(dest="command", required=True)
    calibrate = commands.add_parser("calibrate")
    calibrate.add_argument("calibration_folder")
    _target_arguments(calibrate)
    calibrate.add_argument("--output", required=True)
    calibrate.add_argument("--debug-dir")
    estimate = commands.add_parser("estimate")
    estimate.add_argument("image")
    _target_arguments(estimate)
    estimate.add_argument("--calibration")
    estimate.add_argument("--points")
    estimate.add_argument("--debug-dir")
    track = commands.add_parser("track")
    track.add_argument("--camera", type=int, default=0)
    _target_arguments(track)
    track.add_argument("--calibration")
    return parser


def run(argv: Sequence[str] | None = None, *, collector: CornerCollector | None = None) -> int:
    try:
        args = build_parser().parse_args(argv)
        if args.command == "calibrate":
            _run_calibrate(args, collector)
        elif args.command == "estimate":
            _run_estimate(args, collector)
        else:
            _run_track(args, collector)
        return 0
    except CameraPoseError as error:
        print(f"{error.code}: {_action(error.code)}", file=sys.stderr)
        return 2


def main() -> None:
    raise SystemExit(run())


def collect_four_corners(image: ArrayLike, *, collector: CornerCollector | None = None) -> NDArray[np.float64]:
    values = np.asarray(image)
    selected = (collector or _opencv_collector)(values, ("TL", "TR", "BR", "BL"))
    if selected is None:
        raise CameraPoseError("CANCELLED")
    return validate_quad(selected, values.shape[1], values.shape[0])


def _run_calibrate(args: argparse.Namespace, collector: CornerCollector | None) -> None:
    folder = Path(args.calibration_folder)
    images = sorted(path for path in folder.iterdir() if path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}) if folder.is_dir() else []
    if not images:
        raise CameraPoseError("CALIBRATION_FAILED", "No calibration images were found.")
    target = PlaneTarget(args.target_width, args.target_height)
    object_points = plane_object_points(target)
    captures: list[CalibrationCapture] = []
    debug = DebugWriter(args.debug_dir) if args.debug_dir else None
    identity: CameraIdentity | None = None
    for path in images:
        loaded = load_analysis_image(path)
        current_identity = _identity(loaded)
        if identity is None:
            identity = current_identity
        points_path = path.with_suffix(path.suffix + ".json")
        if not points_path.exists():
            points_path = path.with_suffix(".json")
        points = _read_points(points_path) if points_path.exists() else collect_four_corners(np.asarray(loaded.image), collector=collector)
        capture = CalibrationCapture(np.asarray(loaded.image), points, object_points, current_identity, name=path.stem)
        captures.append(capture)
        if debug:
            gate = assess_calibration_capture(capture)
            debug.write_corner_overlay(path.stem, capture.image, points, accepted=gate.accepted)
            debug.write_json(f"{path.stem}-metrics", {"accepted": gate.accepted, "metrics": dict(gate.metrics), "reasonCode": gate.reason_code})
    result = calibrate_quick(captures)
    save_calibration(result, args.output, identity)  # type: ignore[arg-type]
    print(json.dumps(_calibration_summary(result), sort_keys=True, separators=(",", ":")))


def _run_estimate(args: argparse.Namespace, collector: CornerCollector | None) -> None:
    loaded = load_analysis_image(args.image)
    image = np.asarray(loaded.image)
    points = _read_points(Path(args.points)) if args.points else collect_four_corners(image, collector=collector)
    intrinsics = load_calibration(args.calibration, _identity(loaded)).intrinsics if args.calibration else estimate_uncalibrated_intrinsics(loaded.analysis_size_px, loaded.exif)
    pose = estimate_pose(plane_object_points(PlaneTarget(args.target_width, args.target_height)), points, intrinsics)
    output = {
        "horizontalOffsetM": pose.horizontal_offset_m,
        "normalizedRms": pose.normalized_rms,
        "perpendicularDistanceM": pose.perpendicular_distance_m,
        "quality": pose.quality,
        "targetCenterDistanceM": pose.target_center_distance_m,
        "verticalOffsetM": pose.vertical_offset_m,
    }
    if args.debug_dir:
        writer = DebugWriter(args.debug_dir)
        writer.write_corner_overlay("estimate", image, points, accepted=True)
        writer.write_json("pose-summary", output)
    print(json.dumps(output, sort_keys=True, separators=(",", ":")))


def _run_track(args: argparse.Namespace, collector: CornerCollector | None) -> None:
    capture = cv2.VideoCapture(args.camera)
    if not capture.isOpened():
        capture.release()
        raise CameraPoseError("UNSUPPORTED_CAMERA")
    try:
        ok, frame = capture.read()
        if not ok:
            raise CameraPoseError("UNSUPPORTED_CAMERA")
        size = (frame.shape[1], frame.shape[0])
        identity = CameraIdentity(f"camera-{args.camera}", "default", 1.0, 1, size)
        intrinsics = load_calibration(args.calibration, identity).intrinsics if args.calibration else estimate_uncalibrated_intrinsics(size)
        points = collect_four_corners(frame, collector=collector)
        tracker = PlanarTracker(PlaneTarget(args.target_width, args.target_height), intrinsics)
        tracker.initialize(frame, points)
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            state = tracker.update(frame)
            canvas = frame.copy()
            cv2.polylines(canvas, [np.rint(state.quad_px).astype(np.int32)], True, (0, 220, 0) if state.status == "tracking" else (120, 120, 120), 2)
            cv2.imshow("LAB 004 tracking", canvas)
            if state.status == "lost" or cv2.waitKey(1) & 0xFF in (27, ord("q")):
                break
    finally:
        capture.release()
        cv2.destroyAllWindows()


def _opencv_collector(image: NDArray[np.uint8], labels: Sequence[str]) -> ArrayLike | None:
    points: list[tuple[float, float]] = []
    window = "LAB 004 corners"
    def click(event: int, x: int, y: int, _flags: int, _data: object) -> None:
        if event == cv2.EVENT_LBUTTONDOWN and len(points) < 4:
            points.append((float(x), float(y)))
    cv2.namedWindow(window)
    cv2.setMouseCallback(window, click)
    try:
        while len(points) < 4:
            canvas = image.copy()
            for index, point in enumerate(points):
                cv2.circle(canvas, tuple(map(int, point)), 4, (0, 220, 0), -1)
                cv2.putText(canvas, labels[index], tuple(map(int, point)), cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 220, 0), 1)
            cv2.imshow(window, canvas)
            if cv2.waitKey(20) & 0xFF in (27, ord("q")):
                return None
        return points
    finally:
        cv2.destroyWindow(window)


def _read_points(path: Path) -> NDArray[np.float64]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        value = data.get("points", data.get("imagePointsPx")) if isinstance(data, dict) else data
        points = np.asarray(value, np.float64)
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise CameraPoseError("INVALID_QUAD") from error
    if points.shape != (4, 2) or not np.isfinite(points).all():
        raise CameraPoseError("INVALID_QUAD")
    return points


def _identity(image: AnalysisImage) -> CameraIdentity:
    exif = image.exif
    camera_id = "|".join(str(exif.get(key, "unknown")) for key in ("Make", "Model"))
    lens_id = str(exif.get("LensModel", "default"))
    try:
        zoom = float(exif.get("DigitalZoomRatio", 1.0))
    except (TypeError, ValueError):
        zoom = 1.0
    return CameraIdentity(camera_id, lens_id, zoom, 1, image.analysis_size_px)


def _target_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--target-width", type=float, required=True)
    parser.add_argument("--target-height", type=float, required=True)


def _calibration_summary(result: object) -> dict[str, object]:
    return {"acceptedViews": result.metrics.accepted_views, "normalizedRms": result.metrics.normalized_rms, "rmsPx": result.metrics.rms_px, "schema": result.schema, "source": result.intrinsics.source}


def _action(code: str) -> str:
    return {
        "CANCELLED": "Operation cancelled.",
        "INSUFFICIENT_VIEW_DIVERSITY": "Capture at least 8 sharp views from varied angles and positions.",
        "TRACKING_LOST": "Reinitialize the target corners.",
        "CAMERA_CHANGED": "Use the camera, lens, zoom, and orientation from calibration.",
        "INTRINSICS_MISMATCH": "Use calibration with the same aspect and crop.",
    }.get(code, "Check the input and try again.")
