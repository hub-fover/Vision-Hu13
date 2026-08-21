"""High-level measurement orchestration and serializable diagnostics."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np

from .contracts import DisplacementSeries, MeasurementReport, ScaleReference, TrackingDiagnostics, TrackingSample
from .dic import estimate_dic_translation
from .errors import MeasurementError
from .flow import track_flow_sequence
from .scale import pixels_to_metres, validate_scale_reference
from .signal import dominant_frequency, resample_series, summarize_signal
from .target import TargetRegion, validate_target_region
from .template import track_template_sequence


def measure_frames(
    frames: list[np.ndarray], region: TargetRegion, scale: ScaleReference, *, fps: float = 30.0,
    method: str = "template", timestamps_s: np.ndarray | None = None,
    background_region: TargetRegion | None = None, debug_dir: str | Path | None = None,
) -> MeasurementReport:
    if not frames:
        raise MeasurementError("INVALID_FRAME", "At least one frame is required.")
    shape = frames[0].shape[:2]
    validate_target_region(region, (shape[1], shape[0]))
    validate_scale_reference(scale, (shape[1], shape[0]))
    method = str(method).lower()
    if method not in {"template", "flow", "dic"}:
        raise MeasurementError("INVALID_FRAME", f"Unknown tracking method: {method}")
    if timestamps_s is None:
        timestamps_s = np.arange(len(frames), dtype=np.float64) / float(fps)
    else:
        timestamps_s = np.asarray(timestamps_s, dtype=np.float64)
        if len(timestamps_s) != len(frames):
            raise MeasurementError("FPS_UNSTABLE", "Timestamp count does not match frame count.")
    if method == "template":
        samples = track_template_sequence(frames, region, fps=fps)
        diagnostics = _diagnostics_from_samples(samples, fps)
    elif method == "flow":
        samples, diagnostics = track_flow_sequence(frames, region, fps=fps, background_region=background_region)
    else:
        samples = [TrackingSample(0, float(timestamps_s[0]), 0, 0, score=1.0)]
        for index, frame in enumerate(frames[1:], 1):
            try:
                result = estimate_dic_translation(frames[0], frame, region)
                samples.append(TrackingSample(index, float(timestamps_s[index]), result.dx_px, result.dy_px, score=result.score))
            except MeasurementError as error:
                samples.append(TrackingSample(index, float(timestamps_s[index]), valid=False, error_code=error.code))
        diagnostics = _diagnostics_from_samples(samples, fps)
    # Attach physical units and actual timestamps after the tracker has produced pixels.
    scale_m_per_px = scale.real_distance_m / float(np.linalg.norm(np.asarray(scale.p2_px) - np.asarray(scale.p1_px)))
    for sample in samples:
        sample.time_s = float(timestamps_s[sample.frame_index])
        if sample.valid:
            sample.dx_m = sample.dx_px * scale_m_per_px
            sample.dy_m = sample.dy_px * scale_m_per_px
    valid_samples = [sample for sample in samples if sample.valid]
    magnitudes = np.asarray([np.hypot(sample.dx_px, sample.dy_px) for sample in valid_samples], dtype=np.float64)
    peak_to_peak_m, rms_m = summarize_signal(magnitudes, scale_m_per_px)
    series = DisplacementSeries(samples=samples, peak_to_peak_m=peak_to_peak_m, rms_m=rms_m, peak_to_peak_px=float(np.ptp(magnitudes)) if magnitudes.size else 0.0)
    spectrum = None
    errors: list[str] = []
    if len(valid_samples) >= 2:
        try:
            times = np.asarray([sample.time_s for sample in valid_samples])
            values = np.asarray([sample.dx_m for sample in valid_samples])
            uniform_times, uniform_values = resample_series(times, values, fps=fps)
            spectrum = dominant_frequency(uniform_times, uniform_values)
        except MeasurementError as error:
            if error.code not in {"INSUFFICIENT_SAMPLES", "FPS_UNSTABLE"}:
                raise
            errors.append(error.code)
    errors.extend(sorted({sample.error_code for sample in samples if sample.error_code}))
    report = MeasurementReport(
        displacement=series, spectrum=spectrum, diagnostics=diagnostics, method=method, scale=scale, errors=errors,
    )
    if debug_dir is not None:
        write_debug(report, debug_dir)
    return report


def _diagnostics_from_samples(samples: list[TrackingSample], fps: float) -> TrackingDiagnostics:
    valid = [sample for sample in samples if sample.valid]
    scores = [sample.score for sample in valid]
    error = next((sample.error_code for sample in samples if sample.error_code), None)
    return TrackingDiagnostics(
        camera_stable=error != "CAMERA_MOVED",
        background_trackable=error != "BACKGROUND_UNTRACKABLE",
        valid_ratio=len(valid) / len(samples) if samples else 0.0,
        mean_score=float(np.mean(scores)) if scores else 0.0,
        fps=float(fps), error_code=error,
    )


def write_report(report: MeasurementReport, output: str | Path) -> None:
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")


def write_debug(report: MeasurementReport, debug_dir: str | Path) -> None:
    directory = Path(debug_dir)
    directory.mkdir(parents=True, exist_ok=True)
    samples = report.displacement.samples
    with (directory / "displacement.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["frameIndex", "timeS", "dxPx", "dyPx", "dxM", "dyM", "score", "valid", "errorCode"])
        for sample in samples:
            writer.writerow([sample.frame_index, sample.time_s, sample.dx_px, sample.dy_px, sample.dx_m, sample.dy_m, sample.score, sample.valid, sample.error_code or ""])
    (directory / "spectrum.json").write_text(json.dumps(report.spectrum.to_dict() if report.spectrum else {"error": "INSUFFICIENT_SAMPLES"}, indent=2), encoding="utf-8")
    (directory / "diagnostics.json").write_text(json.dumps(report.diagnostics.to_dict(), indent=2), encoding="utf-8")
    (directory / "report.json").write_text(json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
