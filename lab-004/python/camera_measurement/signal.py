"""Timestamp normalization and FFT diagnostics."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .contracts import FREQUENCY_BAND_HZ, MIN_SAMPLES_FOR_SPECTRUM, SpectrumPeak
from .errors import MeasurementError


def resample_series(timestamps: np.ndarray, values: np.ndarray, fps: float = 30.0) -> tuple[np.ndarray, np.ndarray]:
    t = np.asarray(timestamps, dtype=np.float64).reshape(-1)
    v = np.asarray(values, dtype=np.float64).reshape(-1)
    if len(t) != len(v) or len(t) < 2 or not np.isfinite(t).all() or not np.isfinite(v).all() or fps <= 0:
        raise MeasurementError("FPS_UNSTABLE", "Timestamps and values must be finite and have equal length.")
    order = np.argsort(t)
    t, v = t[order], v[order]
    intervals = np.diff(t)
    if np.any(intervals <= 0):
        raise MeasurementError("FPS_UNSTABLE", "Timestamps must be strictly increasing.")
    median_interval = float(np.median(intervals))
    if median_interval <= 0 or np.max(intervals) > median_interval * 2.5:
        raise MeasurementError("FPS_UNSTABLE", "Frame cadence is too irregular.")
    count = max(2, int(round((t[-1] - t[0]) * fps)) + 1)
    uniform = np.linspace(t[0], t[-1], count)
    return uniform, np.interp(uniform, t, v)


def _detrend(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float64)
    x = np.linspace(-1.0, 1.0, values.size)
    coefficients = np.polyfit(x, values, 1)
    return values - np.polyval(coefficients, x)


def dominant_frequency(
    timestamps: np.ndarray, values: np.ndarray, *, frequency_band_hz: tuple[float, float] = FREQUENCY_BAND_HZ
) -> SpectrumPeak:
    t = np.asarray(timestamps, dtype=np.float64).reshape(-1)
    v = np.asarray(values, dtype=np.float64).reshape(-1)
    if len(t) < MIN_SAMPLES_FOR_SPECTRUM:
        raise MeasurementError("INSUFFICIENT_SAMPLES", f"At least {MIN_SAMPLES_FOR_SPECTRUM} samples are required.")
    if len(t) != len(v) or len(t) < 2:
        raise MeasurementError("INVALID_FRAME", "Signal arrays must have equal length.")
    dt = float(np.median(np.diff(t)))
    if not np.isfinite(dt) or dt <= 0:
        raise MeasurementError("FPS_UNSTABLE", "Invalid sample interval.")
    signal = _detrend(v)
    window = np.hanning(len(signal))
    transformed = np.fft.rfft(signal * window)
    frequencies = np.fft.rfftfreq(len(signal), dt)
    amplitude = 2.0 * np.abs(transformed) / max(np.sum(window), 1.0)
    lower, upper = frequency_band_hz
    mask = (frequencies >= lower) & (frequencies <= upper)
    if not np.any(mask):
        raise MeasurementError("INSUFFICIENT_SAMPLES", "No frequency bins are in the configured band.")
    indices = np.flatnonzero(mask)
    peak_index = int(indices[np.argmax(amplitude[indices])])
    peak_amplitude = float(amplitude[peak_index])
    baseline = float(np.median(amplitude[indices])) + 1e-12
    prominence = peak_amplitude / baseline
    # Parabolic interpolation in log amplitude gives a stable sub-bin estimate.
    if 0 < peak_index < len(amplitude) - 1:
        local = np.log(np.maximum(amplitude[peak_index - 1:peak_index + 2], 1e-12))
        denominator = local[0] - 2 * local[1] + local[2]
        if abs(denominator) > 1e-12:
            offset = float(np.clip(0.5 * (local[0] - local[2]) / denominator, -0.5, 0.5))
            peak_frequency = float(frequencies[peak_index] + offset / (len(t) * dt))
        else:
            peak_frequency = float(frequencies[peak_index])
    else:
        peak_frequency = float(frequencies[peak_index])
    return SpectrumPeak(peak_frequency, peak_amplitude, float(prominence))


def summarize_signal(values: np.ndarray, scale_m_per_px: float = 1.0) -> tuple[float, float]:
    array = np.asarray(values, dtype=np.float64)
    if array.size == 0:
        return 0.0, 0.0
    metres = array * scale_m_per_px
    return float(np.ptp(metres)), float(np.sqrt(np.mean((metres - np.mean(metres)) ** 2)))

