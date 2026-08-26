"""Convert static-scene image motion into reference-level camera speed."""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np

from .contracts import ScaleReference, SpeedSample, StaticSceneRegion
from .errors import MeasurementError
from .flow import track_camera_motion_sequence
from .scale import validate_scale_reference
from .target import validate_target_region


def _scale_m_per_px(scale: ScaleReference) -> float:
    pixels = math.hypot(scale.p2_px[0] - scale.p1_px[0], scale.p2_px[1] - scale.p1_px[1])
    if not np.isfinite(pixels) or pixels <= 0 or scale.real_distance_m <= 0:
        raise MeasurementError("INVALID_SCALE", "Scale points must have a positive known distance.")
    return float(scale.real_distance_m / pixels)


def velocity_from_samples(samples: Sequence[SpeedSample], scale_m_per_px: float, timestamps_s: Sequence[float] | None = None) -> list[SpeedSample]:
    """Differentiate cumulative pixel motion using real timestamps.

    Static scene pixels move opposite to the phone. The sign is reversed before
    converting to metres, making the vector represent camera motion.
    """
    if not np.isfinite(scale_m_per_px) or scale_m_per_px <= 0:
        raise MeasurementError("INVALID_SCALE", "Scale must be positive metres per pixel.")
    if not samples:
        raise MeasurementError("INVALID_FRAME", "At least one tracking sample is required.")
    times = np.asarray(timestamps_s if timestamps_s is not None else [sample.time_s for sample in samples], dtype=np.float64).reshape(-1)
    if len(times) != len(samples) or not np.isfinite(times).all() or np.any(np.diff(times) <= 0):
        raise MeasurementError("FPS_UNSTABLE", "Timestamps must be finite and increasing.")
    output: list[SpeedSample] = [SpeedSample(samples[0].frame_index, float(times[0]), valid=False, error_code=None)]
    for i in range(1, len(samples)):
        previous, current = samples[i - 1], samples[i]
        dt = float(times[i] - times[i - 1])
        if not previous.valid or not current.valid or dt <= 0:
            output.append(SpeedSample(current.frame_index, float(times[i]), valid=False, error_code=current.error_code or previous.error_code))
            continue
        vx = -(current.dx_px - previous.dx_px) * scale_m_per_px / dt
        vy = -(current.dy_px - previous.dy_px) * scale_m_per_px / dt
        speed = float(np.hypot(vx, vy))
        direction = float(np.degrees(np.arctan2(vy, vx)))
        confidence = float(min(previous.confidence, current.confidence))
        output.append(SpeedSample(current.frame_index, float(times[i]), velocity_mps=speed, velocity_kmh=speed * 3.6, vx_mps=float(vx), vy_mps=float(vy), direction_deg=direction, confidence=confidence, valid=True, dx_px=current.dx_px, dy_px=current.dy_px))
    return output


def measure_static_scene_speed(frames: list[np.ndarray], region: StaticSceneRegion, scale: ScaleReference, *, fps: float = 30.0, timestamps_s: np.ndarray | None = None, debug_dir=None):
    """Track a static patch while the phone moves and return speed samples + diagnostics."""
    if not frames:
        raise MeasurementError("INVALID_FRAME", "At least one frame is required.")
    shape = frames[0].shape[:2]
    validate_target_region(region, (shape[1], shape[0]), min_size=32)
    validate_scale_reference(scale, (shape[1], shape[0]))
    try:
        rate = float(fps)
    except (TypeError, ValueError, OverflowError) as exc:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be positive.") from exc
    if not np.isfinite(rate) or rate <= 0:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be positive.")
    times = np.asarray(timestamps_s if timestamps_s is not None else np.arange(len(frames), dtype=np.float64) / rate, dtype=np.float64).reshape(-1)
    if len(times) != len(frames) or not np.isfinite(times).all() or np.any(np.diff(times) <= 0):
        raise MeasurementError("FPS_UNSTABLE", "Timestamps must be finite and increasing.")
    tracked, diagnostics = track_camera_motion_sequence(frames, region, fps=rate)
    for sample, time_s in zip(tracked, times):
        sample.time_s = float(time_s)
    return velocity_from_samples(tracked, _scale_m_per_px(scale), times), diagnostics


# Readable public alias used by CLI and browser parity tests.
measure_camera_speed = measure_static_scene_speed
