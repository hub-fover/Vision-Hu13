"""Command line entry points for local visual displacement measurement."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2

from .errors import MeasurementError
from .io import load_source
from .report import measure_frames, write_report
from .scale import scale_from_dict
from .target import region_from_dict


def _json_file(path: str | Path) -> dict:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise MeasurementError("DECODE_FAILED", f"Cannot read JSON file: {path}") from exc
    if not isinstance(value, dict):
        raise MeasurementError("DECODE_FAILED", "JSON input must be an object.")
    return value


def _common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--target-roi", required=True, help="JSON file containing xPx/yPx/widthPx/heightPx")
    parser.add_argument("--scale-points", required=True, help="JSON file containing p1Px/p2Px/realDistance/unit")
    parser.add_argument("--method", choices=("template", "flow", "dic"), default="template")
    parser.add_argument("--output", required=True)
    parser.add_argument("--debug-dir")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="camera_measurement")
    commands = parser.add_subparsers(dest="command", required=True)
    video = commands.add_parser("measure-video", help="Measure a video file")
    video.add_argument("source")
    _common(video)
    frames = commands.add_parser("analyze-frames", help="Measure an image-frame directory")
    frames.add_argument("source")
    frames.add_argument("--fps", type=float, default=30.0)
    _common(frames)
    track = commands.add_parser("track", help="Measure frames from a camera")
    track.add_argument("--camera", type=int, default=0)
    _common(track)
    return parser


def _camera_frames(index: int, count: int = 300):
    capture = cv2.VideoCapture(index)
    if not capture.isOpened():
        raise MeasurementError("PERMISSION_DENIED", "Camera could not be opened.")
    frames = []
    try:
        for _ in range(count):
            ok, frame = capture.read()
            if not ok:
                break
            frames.append(frame)
    finally:
        capture.release()
    if not frames:
        raise MeasurementError("DECODE_FAILED", "Camera returned no frames.")
    return frames


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "track":
            frames = _camera_frames(args.camera)
            fps = 30.0
        else:
            sequence = load_source(args.source, fps=getattr(args, "fps", 30.0))
            frames, fps = sequence.frames, sequence.fps
            timestamps = sequence.timestamps_s
        first_shape = frames[0].shape[:2]
        region = region_from_dict(_json_file(args.target_roi))
        scale = scale_from_dict(_json_file(args.scale_points), (first_shape[1], first_shape[0]))
        report = measure_frames(
            frames, region, scale, fps=fps, method=args.method,
            timestamps_s=None if args.command == "track" else timestamps,
            debug_dir=args.debug_dir,
        )
        write_report(report, args.output)
        return 0
    except MeasurementError as error:
        output = {"errorCode": error.code, "message": str(error)}
        print(json.dumps(output, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

