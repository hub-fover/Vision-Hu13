from __future__ import annotations

import gzip
import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest


LAB = Path(__file__).resolve().parents[2]
CONFIG_PATH = LAB / "runtime" / "opencv-whitelist.json"
BUILDER_PATH = LAB / "scripts" / "build_opencv.py"


def load_builder():
    spec = importlib.util.spec_from_file_location("lab004_build_opencv", BUILDER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_config_has_pinned_source_toolchain_and_minimal_modules() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    assert config["source"]["commit"] == "49486f61fb25722cbcf586b7f4320921d46fb38e"
    assert config["source"]["tag"] == "4.12.0"
    assert config["toolchain"] == {
        "image": "emscripten/emsdk:4.0.10",
        "digest": "sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7",
    }
    assert config["modules"] == ["core", "imgproc", "video", "calib3d"]


def test_whitelist_covers_pose_calibration_and_tracking_symbols() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    symbols = {symbol for values in config["symbolsByModule"].values() for symbol in values}
    required = {
        "solvePnPGeneric", "solvePnP", "solvePnPRefineLM", "calibrateCamera",
        "calibrateCameraExtended", "findChessboardCorners", "cornerSubPix",
        "goodFeaturesToTrack", "calcOpticalFlowPyrLK", "findHomography", "Rodrigues",
        "projectPoints", "perspectiveTransform", "cvtColor", "Laplacian", "GaussianBlur",
        "resize", "Mat", "MatVector", "matFromArray", "matFromImageData", "Size",
    }
    assert required <= symbols
    assert set(config["symbolsByModule"]) == set(config["modules"])


def test_manifest_validation_checks_hash_sizes_and_whitelist(tmp_path: Path) -> None:
    builder = load_builder()
    artifact = tmp_path / "opencv.js"
    artifact.write_bytes(b"deterministic fixture")
    manifest = builder.manifest_for_artifact(artifact, CONFIG_PATH)
    builder.validate_manifest(manifest, artifact)

    broken = dict(manifest)
    broken["sha256"] = "0" * 64
    with pytest.raises(ValueError, match="SHA256"):
        builder.validate_manifest(broken, artifact)

    broken = dict(manifest)
    broken["gzipBytes"] = 8 * 1024 * 1024 + 1
    with pytest.raises(ValueError, match="gzip"):
        builder.validate_manifest(broken, artifact)

    broken = dict(manifest)
    broken["gzipBytes"] += 1
    with pytest.raises(ValueError, match="gzip byte count"):
        builder.validate_manifest(broken, artifact)


def test_dry_run_emits_deterministic_manifest_without_docker(tmp_path: Path) -> None:
    manifest_path = tmp_path / "manifest.json"
    completed = subprocess.run(
        [sys.executable, str(BUILDER_PATH), "--dry-run", "--manifest", str(manifest_path)],
        cwd=LAB.parent,
        check=True,
        text=True,
        capture_output=True,
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["dryRun"] is True
    assert manifest["sourceCommit"] == "49486f61fb25722cbcf586b7f4320921d46fb38e"
    assert manifest["toolchainDigest"].startswith("sha256:")
    assert manifest["artifactPresent"] is False
    assert "Docker" in completed.stdout


def test_manifest_uses_pages_safe_same_origin_relative_path() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    path = config["artifact"]["pagesRelativePath"]
    assert path.startswith("./")
    assert not Path(path).is_absolute()
    assert ".." not in Path(path).parts
    assert config["artifact"]["singleFileWasm"] is True


def test_docker_command_contains_each_cmake_pin_and_fixed_memory_flags() -> None:
    builder = load_builder()
    config = builder.load_config()
    command = builder.docker_command(Path("C:/src/opencv"), Path("C:/out"), config)
    rendered = " ".join(command)
    assert "python3 ./platforms/js/build_js.py" in rendered
    assert "emcmake python" not in rendered
    assert "-DBUILD_LIST=core,imgproc,video,calib3d,js" in rendered
    assert "git apply --check /runtime/patches/opencv-4.12-emscripten-4.0.10.patch" in rendered
    for option in config["build"]["cmakeOptions"]:
        assert f"--cmake_option={option}" in rendered
    assert "-s ALLOW_MEMORY_GROWTH=0" in rendered
    assert "-s INITIAL_MEMORY=134217728" in rendered
    assert "-s MAXIMUM_MEMORY=268435456" in rendered


def test_runtime_sources_do_not_reference_remote_runtime_urls() -> None:
    for path in (LAB / "runtime").rglob("*"):
        if path.is_file() and path.suffix in {".py", ".json", ".md", ".js"}:
            text = path.read_text(encoding="utf-8")
            assert "https://docs.opencv.org" not in text
            assert "https://cdn.jsdelivr.net" not in text
