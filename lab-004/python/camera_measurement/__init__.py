"""Local static-scene speed estimation for LAB004."""

from .contracts import (
    ANALYSIS_MAX_SIDE, MAX_CAMERA_DRIFT_PX, MAX_WORKING_SET_MIB, SCHEMA_VERSION,
    TARGET_ANALYSIS_FPS, ScaleReference, SpeedDiagnostics, SpeedOptions,
    SpeedReport, SpeedSample, SpeedSeries, StaticSceneRegion,
)
from .errors import ERROR_CODES, MeasurementError
from .flow import track_camera_motion_sequence, track_flow_sequence
from .report import measure_frames, write_debug, write_report
from .scale import pixels_to_metres, scale_from_dict, validate_scale_reference, validate_unit
from .speed import measure_camera_speed, measure_static_scene_speed, velocity_from_samples
from .target import crop_region, ensure_trackable, region_from_dict, texture_contrast, validate_target_region

__all__ = [
    "ANALYSIS_MAX_SIDE", "MAX_CAMERA_DRIFT_PX", "MAX_WORKING_SET_MIB", "SCHEMA_VERSION", "TARGET_ANALYSIS_FPS",
    "ScaleReference", "StaticSceneRegion", "SpeedOptions", "SpeedSample", "SpeedSeries", "SpeedDiagnostics", "SpeedReport",
    "ERROR_CODES", "MeasurementError", "measure_frames", "measure_static_scene_speed", "measure_camera_speed", "velocity_from_samples",
    "track_camera_motion_sequence", "track_flow_sequence", "pixels_to_metres", "scale_from_dict", "validate_scale_reference", "validate_unit",
    "region_from_dict", "validate_target_region", "crop_region", "texture_contrast", "ensure_trackable", "write_debug", "write_report",
]
