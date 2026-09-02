from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .alignment import align_stack
from .depth import estimate_relative_depth
from .errors import DefocusDepthError
from .focus_metrics import focus_curve, local_focus_scores
from .intrinsics import CameraIntrinsics, calibrate_intrinsics, undistort_stack
from .io import load_stack, write_png
from .report import make_report
from .scale import calibrate_scale, calibrate_scale_from_folder


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="defocus_depth")
    sub = parser.add_subparsers(dest="command", required=True)
    estimate = sub.add_parser("estimate", help="estimate a relative depth map from five images")
    estimate.add_argument("stack_folder")
    estimate.add_argument("--output", required=True)
    estimate.add_argument("--calibration")
    estimate.add_argument("--scale-calibration")
    estimate.add_argument("--debug-dir")
    ci = sub.add_parser("calibrate-intrinsics")
    ci.add_argument("calibration_folder")
    ci.add_argument("--pattern", default="9x6", help="inner corners, e.g. 9x6")
    ci.add_argument("--square-size", type=float, required=True)
    ci.add_argument("--output", required=True)
    ci.add_argument("--debug-dir")
    cs = sub.add_parser("calibrate-scale")
    cs.add_argument("scale_folder")
    cs.add_argument("--distances", nargs=3, type=float, required=True)
    cs.add_argument("--focus-indices", nargs=3, type=float, help="manual override; otherwise derive from the three focus stacks")
    cs.add_argument("--calibration", required=True, help="camera intrinsics used to bind lens compatibility metadata")
    cs.add_argument("--output", required=True)
    cs.add_argument("--debug-dir")
    return parser


def _write_debug(path: str | None, name: str, value) -> None:
    if not path:
        return
    folder = Path(path); folder.mkdir(parents=True, exist_ok=True)
    if isinstance(value, np.ndarray):
        np.save(folder / f"{name}.npy", value)
    else:
        (folder / f"{name}.json").write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_json(path: str, error_code: str) -> dict:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DefocusDepthError(error_code) from exc
    if not isinstance(value, dict):
        raise DefocusDepthError(error_code)
    return value


def estimate_command(args: argparse.Namespace) -> int:
    if args.scale_calibration and not args.calibration:
        raise DefocusDepthError(
            "DEPTH_SCALE_UNCALIBRATED",
            "Metric depth requires both camera intrinsics and a focus-depth scale.",
        )
    frames = load_stack(args.stack_folder)
    if args.calibration:
        camera = CameraIntrinsics.from_dict(_read_json(args.calibration, "INTRINSICS_MISMATCH"))
        frames = undistort_stack(frames, camera)
    aligned = align_stack(frames)
    curve = focus_curve(aligned.frames)
    scores = local_focus_scores(aligned.frames)
    texture = np.mean(scores, axis=0)
    texture = texture / max(float(texture.max()), 1e-8)
    result = estimate_relative_depth(scores, texture=texture)
    output = (result.depth * 255).astype(np.uint8)
    write_png(args.output, output)
    report = make_report(result, curve, metric_depth_available=bool(args.scale_calibration))
    payload = result.to_dict() | {"focusCurve": curve.tolist()} | report.to_dict()
    if args.scale_calibration:
        from .scale import FocusDepthScale
        scale = FocusDepthScale.from_dict(_read_json(args.scale_calibration, "DEPTH_SCALE_UNCALIBRATED"))
        scale.validate_for_camera(camera)
        payload["metricDepthM"] = scale.distance_for_focus(result.peak_index / 4.0).tolist()
        payload["metricQuality"] = "reference-only"
    Path(args.output).with_suffix(".json").write_text(json.dumps(payload), encoding="utf-8")
    _write_debug(args.debug_dir, "focus_curve", curve)
    _write_debug(args.debug_dir, "alignment", {"errors": aligned.errors, "inlierRatios": aligned.inlier_ratios})
    _write_debug(args.debug_dir, "focus_scores", scores)
    _write_debug(args.debug_dir, "peak_map", result.peak_index)
    _write_debug(args.debug_dir, "invalid_mask", (~result.valid).astype(np.uint8))
    _write_debug(args.debug_dir, "confidence", result.confidence)
    if args.debug_dir:
        for index, frame in enumerate(aligned.frames):
            write_png(Path(args.debug_dir) / f"aligned_{index}.png", frame)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "estimate":
            return estimate_command(args)
        if args.command == "calibrate-intrinsics":
            pattern = tuple(int(part) for part in args.pattern.lower().split("x"))
            result = calibrate_intrinsics(args.calibration_folder, pattern, args.square_size)
            Path(args.output).write_text(json.dumps(result.to_dict(), indent=2), encoding="utf-8")
            _write_debug(args.debug_dir, "calibration", result.to_dict())
            _write_debug(args.debug_dir, "calibration_views", result.calibration_metrics)
            return 0
        if args.command == "calibrate-scale":
            camera = CameraIntrinsics.from_dict(
                _read_json(args.calibration, "INTRINSICS_MISMATCH")
            )
            result = (
                calibrate_scale(args.focus_indices, args.distances)
                if args.focus_indices
                else calibrate_scale_from_folder(
                    args.scale_folder, args.distances, camera
                )
            )
            result.bind_camera(camera)
            Path(args.output).write_text(json.dumps(result.to_dict(), indent=2), encoding="utf-8")
            _write_debug(args.debug_dir, "scale_calibration", result.to_dict())
            _write_debug(args.debug_dir, "scale_residual", {"residualM": result.residual_m})
            _write_debug(args.debug_dir, "scale_focus_curves", {"focusCurves": result.focus_curves or []})
            return 0
    except DefocusDepthError as exc:
        print(f"{exc.code}: {exc}")
        return 2
    return 1
