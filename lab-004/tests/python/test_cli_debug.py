from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from camera_pose import CameraPoseError
from camera_pose import TrackingMetrics


def test_cli_parser_supports_exact_three_workflows() -> None:
    from camera_pose.cli import build_parser

    parser = build_parser()
    calibrate = parser.parse_args(["calibrate", "images", "--target-width", ".9", "--target-height", "2", "--output", "camera.json"])
    estimate = parser.parse_args(["estimate", "door.jpg", "--target-width", ".9", "--target-height", "2", "--points", "corners.json"])
    subparsers = next(
        action for action in parser._actions if "track" in (action.choices or {})
    )
    assert "--debug-dir" in subparsers.choices["track"]._option_string_actions
    track = parser.parse_args(["track", "--camera", "0", "--target-width", ".9", "--target-height", "2", "--debug-dir", "debug"])
    assert (calibrate.command, estimate.command, track.command) == ("calibrate", "estimate", "track")
    assert track.debug_dir == "debug"


def test_cli_stable_error_is_concise_and_nonzero(capsys: pytest.CaptureFixture[str]) -> None:
    from camera_pose.cli import run

    code = run(["estimate", "missing.jpg", "--target-width", ".9", "--target-height", "2", "--points", "missing.json"])
    output = capsys.readouterr()
    assert code != 0
    assert "UNSUPPORTED_CAMERA:" in output.err
    assert "Traceback" not in output.err


def test_collect_points_is_injectable_and_cancellation_is_stable() -> None:
    from camera_pose.cli import collect_four_corners

    expected = np.asarray([[2, 2], [37, 2], [37, 37], [2, 37]], np.float64)
    image = np.zeros((40, 40), np.uint8)
    np.testing.assert_array_equal(collect_four_corners(image, collector=lambda *_: expected), expected)
    with pytest.raises(CameraPoseError) as caught:
        collect_four_corners(image, collector=lambda *_: None)
    assert caught.value.code == "CANCELLED"


def test_debug_writer_does_not_mutate_input_and_writes_deterministic_json(tmp_path: Path) -> None:
    from camera_pose.debug import DebugWriter

    image = np.zeros((40, 60, 3), np.uint8)
    before = image.copy()
    writer = DebugWriter(tmp_path)
    writer.write_corner_overlay("view-a", image, [[5, 5], [50, 5], [50, 35], [5, 35]], accepted=True)
    writer.write_json("tracking-metrics", {"z": 1, "a": 2})

    np.testing.assert_array_equal(image, before)
    assert (tmp_path / "view-a.accepted.png").is_file()
    assert json.loads((tmp_path / "tracking-metrics.json").read_text(encoding="utf-8")) == {"a": 2, "z": 1}


def test_track_cli_writes_per_frame_metrics_and_loss_summary(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from camera_pose import cli

    frame = np.zeros((360, 640, 3), np.uint8)
    quad = np.asarray([[170, 80], [470, 80], [470, 300], [170, 300]], np.float64)

    class FakeCapture:
        def __init__(self) -> None:
            self.frames = [frame.copy(), frame.copy()]

        def isOpened(self) -> bool:
            return True

        def read(self) -> tuple[bool, np.ndarray | None]:
            if not self.frames:
                return False, None
            return True, self.frames.pop(0)

        def release(self) -> None:
            pass

    lost = SimpleNamespace(
        status="lost",
        quad_px=quad,
        pose=None,
        measurements=None,
        metrics=TrackingMetrics(8, 0.5, 0.75, 3),
    )

    class FakeTracker:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        def initialize(self, *_args: object, **_kwargs: object) -> None:
            pass

        def update(self, *_args: object, **_kwargs: object) -> object:
            return lost

    monkeypatch.setattr(cli.cv2, "VideoCapture", lambda *_args: FakeCapture())
    monkeypatch.setattr(cli.cv2, "imshow", lambda *_args: None)
    monkeypatch.setattr(cli.cv2, "destroyAllWindows", lambda: None)
    monkeypatch.setattr(cli, "collect_four_corners", lambda *_args, **_kwargs: quad)
    monkeypatch.setattr(cli, "PlanarTracker", FakeTracker)

    code = cli.run([
        "track", "--camera", "0", "--target-width", ".9",
        "--target-height", "2", "--debug-dir", str(tmp_path),
    ])

    assert code == 0
    frame_metrics = json.loads(
        (tmp_path / "tracking-frame-0001.json").read_text(encoding="utf-8")
    )
    summary = json.loads(
        (tmp_path / "tracking-summary.json").read_text(encoding="utf-8")
    )
    assert frame_metrics == {
        "frame": 1,
        "metrics": {
            "consecutiveBadFrames": 3,
            "homographyInlierRatio": 0.5,
            "medianForwardBackwardErrorPx": 0.75,
            "trackedFeatures": 8,
        },
        "status": "lost",
    }
    assert summary == {
        "frames": 1,
        "lastMetrics": frame_metrics["metrics"],
        "outcome": "lost",
    }
