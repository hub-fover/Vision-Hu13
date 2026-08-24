"""Reference-level speed from a static ground reference in a moving-camera video.

The tracked ground patch is stationary in the world, so its image displacement is
the opposite of the camera/aircraft motion.  This is intentionally a local planar
approximation and is never presented as a calibrated aircraft ground speed.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

from .contracts import ScaleReference, TargetRegion, TrackingSample, VelocitySample, VelocitySummary
from .errors import MeasurementError
from .scale import validate_scale_reference
from .target import validate_target_region
from .template import track_template_sequence


def velocity_from_samples(
    samples: Sequence[TrackingSample], scale_m_per_px: float,
    timestamps_s: Sequence[float] | None = None,
) -> VelocitySummary:
    """Differentiate tracked image offsets using the supplied real timestamps."""
    if not np.isfinite(scale_m_per_px) or scale_m_per_px <= 0:
        raise MeasurementError("INVALID_SCALE", "Scale must be a positive metres-per-pixel value.")
    if not samples:
        raise MeasurementError("INVALID_FRAME", "At least one tracking sample is required.")
    times = np.asarray(
        timestamps_s if timestamps_s is not None else [sample.time_s for sample in samples],
        dtype=np.float64,
    ).reshape(-1)
    if len(times) != len(samples) or not np.isfinite(times).all() or np.any(np.diff(times) <= 0):
        raise MeasurementError("FPS_UNSTABLE", "Velocity timestamps must be finite and increasing.")
    # A derivative needs two frames; the reference frame has no velocity sample.
    output: list[VelocitySample] = [VelocitySample(samples[0].frame_index, float(times[0]), valid=False, error_code=None)]
    speeds: list[float] = []
    previous = samples[0]
    for index, current in enumerate(samples[1:], 1):
        dt = float(times[index] - times[index - 1])
        if not previous.valid or not current.valid or dt <= 0:
            output.append(VelocitySample(current.frame_index, float(times[index]), valid=False, error_code=current.error_code or previous.error_code))
        else:
            vx = -(float(current.dx_px) - float(previous.dx_px)) * scale_m_per_px / dt
            vy = -(float(current.dy_px) - float(previous.dy_px)) * scale_m_per_px / dt
            speed = float(np.hypot(vx, vy))
            output.append(VelocitySample(current.frame_index, float(times[index]), vx, vy, speed, True))
            speeds.append(speed)
        previous = current
    return VelocitySummary(
        samples=output,
        mean_speed_mps=float(np.mean(speeds)) if speeds else 0.0,
        peak_speed_mps=float(np.max(speeds)) if speeds else 0.0,
    )


def measure_camera_speed(
    frames: list[np.ndarray], region: TargetRegion, scale: ScaleReference, *,
    fps: float = 30.0, timestamps_s: np.ndarray | None = None,
    min_score: float = 0.55,
) -> VelocitySummary:
    """Track a static ground patch while allowing camera motion."""
    if not frames:
        raise MeasurementError("INVALID_FRAME", "At least one frame is required.")
    shape = frames[0].shape[:2]
    validate_target_region(region, (shape[1], shape[0]))
    validate_scale_reference(scale, (shape[1], shape[0]))
    try:
        rate = float(fps)
    except (TypeError, ValueError, OverflowError) as error:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be positive.") from error
    if not np.isfinite(rate) or rate <= 0:
        raise MeasurementError("FPS_UNSTABLE", "FPS must be positive.")
    times = np.asarray(
        timestamps_s if timestamps_s is not None else np.arange(len(frames), dtype=np.float64) / rate,
        dtype=np.float64,
    )
    if len(times) != len(frames) or not np.isfinite(times).all() or np.any(np.diff(times) <= 0):
        raise MeasurementError("FPS_UNSTABLE", "Timestamps must be finite and increasing.")
    pixels = float(np.linalg.norm(np.asarray(scale.p2_px) - np.asarray(scale.p1_px)))
    if pixels <= 0 or scale.real_distance_m <= 0:
        raise MeasurementError("INVALID_SCALE", "Scale points must have a positive known distance.")
    tracked = track_template_sequence(frames, region, fps=rate, min_score=min_score, allow_camera_motion=True)
    for sample, time_s in zip(tracked, times):
        sample.time_s = float(time_s)
    return velocity_from_samples(tracked, float(scale.real_distance_m) / pixels, times)
