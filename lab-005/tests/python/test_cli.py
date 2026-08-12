import json
import os
from argparse import Namespace
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import cv2
import numpy as np

from defocus_depth import cli
from defocus_depth.cli import build_parser


def test_cli_exposes_three_commands():
    parser = build_parser()
    assert parser.parse_args(["estimate", "stack", "--output", "depth.png"]).command == "estimate"
    assert parser.parse_args(["calibrate-intrinsics", "cal", "--pattern", "9x6", "--square-size", "0.02", "--output", "c.json"]).command == "calibrate-intrinsics"
    assert parser.parse_args(["calibrate-scale", "scale", "--distances", "0.3", "0.6", "1.0", "--output", "s.json", "--calibration", "camera.json", "--debug-dir", "debug"]).debug_dir == "debug"
    assert parser.parse_args(["calibrate-scale", "scale", "--distances", "0.3", "0.6", "1.0", "--output", "s.json", "--calibration", "camera.json"]).calibration == "camera.json"


def test_calibrate_scale_cli_reads_three_five_frame_stacks(tmp_path):
    rng = np.random.default_rng(42)
    base = rng.integers(0, 256, (96, 96), dtype=np.uint8)
    for group_index, peak in enumerate((0, 2, 4)):
        group = tmp_path / f"distance-{group_index}"
        group.mkdir()
        for frame_index in range(5):
            sigma = 0.25 + 1.25 * abs(frame_index - peak)
            frame = cv2.GaussianBlur(base, (0, 0), sigma)
            assert cv2.imwrite(str(group / f"frame-{frame_index}.png"), frame)
    output = tmp_path / "scale.json"
    calibration = tmp_path / "camera.json"
    calibration.write_text(json.dumps({
        "schema": "lab005.camera-intrinsics.v1",
        "intrinsics": {"matrix": [[100, 0, 48], [0, 100, 48], [0, 0, 1]], "distortion": [0, 0, 0, 0, 0], "imageSize": [96, 96]},
    }), encoding="utf-8")
    code = cli.main([
        "calibrate-scale", str(tmp_path), "--distances", "0.3", "0.6", "1.0",
        "--output", str(output), "--calibration", str(calibration),
    ])
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert code == 0
    assert np.allclose(payload["focusIndices"], [0.0, 0.5, 1.0], atol=0.12)
    assert payload["sourceFrameCount"] == 15
    assert payload["intrinsicsSchema"] == "lab005.camera-intrinsics.v1"
    assert payload["imageSize"] == [96, 96]


def test_estimate_cli_applies_intrinsics_before_alignment(tmp_path, monkeypatch):
    frames = [np.full((8, 8), index, np.uint8) for index in range(5)]
    calibration = tmp_path / "camera.json"
    calibration.write_text(json.dumps({
        "schema": "lab005.camera-intrinsics.v1",
        "intrinsics": {"matrix": [[10, 0, 4], [0, 10, 4], [0, 0, 1]], "distortion": [0, 0, 0, 0, 0], "imageSize": [8, 8]},
    }), encoding="utf-8")
    observed = {}
    monkeypatch.setattr(cli, "load_stack", lambda _: frames)

    def fake_undistort(input_frames, camera):
        observed["calibration"] = camera.schema
        return [frame + 10 for frame in input_frames]

    alignment = SimpleNamespace(frames=[frame + 10 for frame in frames], errors=[0] * 5, inlier_ratios=[1] * 5)

    monkeypatch.setattr(cli, "undistort_stack", fake_undistort, raising=False)
    monkeypatch.setattr(cli, "align_stack", lambda aligned: (observed.setdefault("first", int(aligned[0][0, 0])) and None) or alignment)
    monkeypatch.setattr(cli, "focus_curve", lambda _: np.arange(5, dtype=np.float32))
    monkeypatch.setattr(cli, "local_focus_scores", lambda _: np.tile(np.arange(5, dtype=np.float32)[:, None, None], (1, 1, 1)))
    class Result:
        depth = np.zeros((1, 1), np.float32)
        peak_index = np.zeros((1, 1), np.float32)
        confidence = np.ones((1, 1), np.float32)
        valid = np.ones((1, 1), dtype=bool)
        def to_dict(self): return {}
    monkeypatch.setattr(cli, "estimate_relative_depth", lambda *args, **kwargs: Result())
    monkeypatch.setattr(cli, "write_png", lambda *args: None)
    args = Namespace(stack_folder="stack", output=str(tmp_path / "depth.png"), calibration=str(calibration), scale_calibration=None, debug_dir=None)
    assert cli.estimate_command(args) == 0
    assert observed == {"calibration": "lab005.camera-intrinsics.v1", "first": 10}
    payload = json.loads((tmp_path / "depth.json").read_text(encoding="utf-8"))
    assert payload["quality"] == "stable"
    assert payload["valid_fraction"] == 1.0


def test_estimate_cli_requires_intrinsics_for_metric_depth(tmp_path, monkeypatch):
    frames = [np.full((8, 8), index, np.uint8) for index in range(5)]
    scale = tmp_path / "scale.json"
    scale.write_text(json.dumps({
        "schema": "lab005.focus-depth-scale.v1",
        "focusIndices": [0.0, 0.5, 1.0],
        "distancesM": [0.3, 0.6, 1.0],
    }), encoding="utf-8")
    monkeypatch.setattr(cli, "load_stack", lambda _: frames)
    args = Namespace(
        stack_folder="stack",
        output=str(tmp_path / "depth.png"),
        calibration=None,
        scale_calibration=str(scale),
        debug_dir=None,
    )

    try:
        cli.estimate_command(args)
    except cli.DefocusDepthError as exc:
        assert exc.code == "DEPTH_SCALE_UNCALIBRATED"
    else:
        raise AssertionError("metric depth must require camera intrinsics")


def test_python_module_propagates_cli_failure_exit_code(tmp_path):
    env = os.environ.copy()
    python_path = str(Path(__file__).parents[2] / "python")
    env["PYTHONPATH"] = python_path + os.pathsep + env.get("PYTHONPATH", "")
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "defocus_depth",
            "estimate",
            str(tmp_path),
            "--output",
            str(tmp_path / "depth.png"),
        ],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 2
    assert "INVALID_FRAME_COUNT" in completed.stdout


def test_estimate_cli_maps_invalid_calibration_json_to_contract_error(tmp_path, monkeypatch):
    calibration = tmp_path / "camera.json"
    calibration.write_text("not json", encoding="utf-8")
    monkeypatch.setattr(cli, "load_stack", lambda _: [np.zeros((8, 8), np.uint8)] * 5)
    args = Namespace(
        stack_folder="stack",
        output=str(tmp_path / "depth.png"),
        calibration=str(calibration),
        scale_calibration=None,
        debug_dir=None,
    )

    with np.testing.assert_raises(cli.DefocusDepthError) as caught:
        cli.estimate_command(args)
    assert caught.exception.code == "INTRINSICS_MISMATCH"
