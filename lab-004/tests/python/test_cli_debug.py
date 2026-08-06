from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from camera_pose import CameraPoseError


def test_cli_parser_supports_exact_three_workflows() -> None:
    from camera_pose.cli import build_parser

    parser = build_parser()
    calibrate = parser.parse_args(["calibrate", "images", "--target-width", ".9", "--target-height", "2", "--output", "camera.json"])
    estimate = parser.parse_args(["estimate", "door.jpg", "--target-width", ".9", "--target-height", "2", "--points", "corners.json"])
    track = parser.parse_args(["track", "--camera", "0", "--target-width", ".9", "--target-height", "2"])
    assert (calibrate.command, estimate.command, track.command) == ("calibrate", "estimate", "track")


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
