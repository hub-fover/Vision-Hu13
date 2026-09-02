"""High-level static-scene speed report and debug export."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np

from .contracts import ScaleReference, SpeedDiagnostics, SpeedReport, StaticSceneRegion
from .errors import MeasurementError
from .scale import validate_scale_reference
from .speed import measure_static_scene_speed
from .target import ensure_trackable, validate_target_region


def measure_frames(
    frames: list[np.ndarray], region: StaticSceneRegion, scale: ScaleReference, *,
    fps: float = 30.0, method: str = "flow", timestamps_s: np.ndarray | None = None,
    background_region=None, debug_dir: str | Path | None = None,
) -> SpeedReport:
    """Measure reference-level phone speed from a static textured scene.

    ``method`` is retained as a keyword for old callers, but v2 has one
    algorithm only: LK optical flow with a RANSAC affine model.
    """
    if str(method).lower() not in {"flow", "static-scene-speed"}:
        raise MeasurementError("SCENE_CHANGED", "LAB004 v2 only supports static-scene flow.")
    if not frames:
        raise MeasurementError("INVALID_FRAME", "At least one frame is required.")
    shape = frames[0].shape[:2]
    validate_target_region(region, (shape[1], shape[0]), min_size=32)
    validate_scale_reference(scale, (shape[1], shape[0]))
    ensure_trackable(frames[0], region)
    samples, diagnostics = measure_static_scene_speed(frames, region, scale, fps=fps, timestamps_s=timestamps_s, debug_dir=debug_dir)
    valid = [sample for sample in samples if sample.valid]
    speeds = np.asarray([sample.velocity_mps for sample in valid], dtype=np.float64)
    latest = valid[-1] if valid else None
    errors = sorted({sample.error_code for sample in samples if sample.error_code})
    if diagnostics.error_code and diagnostics.error_code not in errors:
        errors.append(diagnostics.error_code)
    report = SpeedReport(
        velocity_mps=float(latest.velocity_mps) if latest else 0.0,
        velocity_kmh=float(latest.velocity_kmh) if latest else 0.0,
        direction_deg=float(latest.direction_deg) if latest else 0.0,
        mean_speed_mps=float(np.mean(speeds)) if speeds.size else 0.0,
        peak_speed_mps=float(np.max(speeds)) if speeds.size else 0.0,
        valid_ratio=float(len(valid) / len(samples)) if samples else 0.0,
        samples=samples,
        diagnostics=SpeedDiagnostics(
            inlier_count=diagnostics.inlier_count,
            inlier_ratio=diagnostics.inlier_ratio,
            median_reprojection_error_px=diagnostics.median_reprojection_error_px,
            forward_backward_error_px=diagnostics.forward_backward_error_px,
            tracked_point_count=diagnostics.tracked_point_count,
            camera_stable=diagnostics.camera_stable,
            scene_texture_score=diagnostics.scene_texture_score,
            valid_ratio=float(len(valid) / len(samples)) if samples else 0.0,
            fps=diagnostics.fps,
            failure_intervals=diagnostics.failure_intervals,
            error_code=diagnostics.error_code,
        ),
        scale=scale,
        errors=errors,
    )
    if debug_dir is not None:
        write_debug(report, debug_dir)
    return report


def write_report(report: SpeedReport, output: str | Path) -> None:
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")


def write_debug(report: SpeedReport, debug_dir: str | Path) -> None:
    directory = Path(debug_dir)
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / "speed.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["frameIndex", "timeS", "velocityMps", "velocityKmh", "vxMps", "vyMps", "directionDeg", "confidence", "valid", "errorCode"])
        for sample in report.samples:
            writer.writerow([sample.frame_index, sample.time_s, sample.velocity_mps, sample.velocity_kmh, sample.vx_mps, sample.vy_mps, sample.direction_deg, sample.confidence, sample.valid, sample.error_code or ""])
    (directory / "diagnostics.json").write_text(json.dumps(report.diagnostics.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    (directory / "report.json").write_text(json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
