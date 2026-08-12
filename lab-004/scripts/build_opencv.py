"""Reproducible, pinned OpenCV.js/WASM builder for LAB004.

Local Windows development uses ``--dry-run``. CI uses Docker with the exact
Emscripten image digest and a checked-out OpenCV source tree at the pinned
commit. Generated vendor output is intentionally outside this source tree.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime"
CONFIG_PATH = RUNTIME / "opencv-whitelist.json"
COMPATIBILITY_PATCH = RUNTIME / "patches" / "opencv-4.12-emscripten-4.0.10.patch"
GZIP_TARGET_BYTES = 8 * 1024 * 1024
PINNED_COMMIT = "49486f61fb25722cbcf586b7f4320921d46fb38e"
PINNED_IMAGE = "emscripten/emsdk:4.0.10"
PINNED_DIGEST = "sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7"


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    config = json.loads(path.read_text(encoding="utf-8"))
    if config["source"]["commit"] != PINNED_COMMIT:
        raise ValueError("OpenCV source commit is not pinned to 4.12.0 exact commit")
    if config["toolchain"] != {"image": PINNED_IMAGE, "digest": PINNED_DIGEST}:
        raise ValueError("Emscripten Docker image or digest does not match the pin")
    if config["modules"] != ["core", "imgproc", "video", "calib3d"]:
        raise ValueError("OpenCV module list must remain core,imgproc,video,calib3d")
    missing = set(config["modules"]) - set(config["symbolsByModule"])
    if missing:
        raise ValueError(f"Whitelist has no symbols for modules: {sorted(missing)}")
    if config["build"]["gzipTargetBytes"] != GZIP_TARGET_BYTES:
        raise ValueError("gzip target must remain 8 MiB")
    return config


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def manifest_for_artifact(artifact: Path, config_path: Path = CONFIG_PATH) -> dict[str, Any]:
    config = load_config(config_path)
    raw_bytes = artifact.stat().st_size
    gzip_bytes = len(gzip.compress(artifact.read_bytes(), compresslevel=9, mtime=0))
    if gzip_bytes > GZIP_TARGET_BYTES:
        raise ValueError(f"OpenCV.js gzip size {gzip_bytes} exceeds 8 MiB")
    return {
        "schemaVersion": "lab004.opencv-manifest.v1",
        "dryRun": False,
        "artifactPresent": True,
        "artifactPath": config["artifact"]["pagesRelativePath"],
        "sourceCommit": config["source"]["commit"],
        "sourceTag": config["source"]["tag"],
        "toolchainImage": config["toolchain"]["image"],
        "toolchainDigest": config["toolchain"]["digest"],
        "modules": config["modules"],
        "buildFlags": config["build"],
        "sha256": _sha256(artifact),
        "rawBytes": raw_bytes,
        "gzipBytes": gzip_bytes,
        "gzipTargetBytes": GZIP_TARGET_BYTES,
        "requiredSymbols": config["symbolsByModule"],
    }


def validate_manifest(manifest: dict[str, Any], artifact: Path | None = None) -> None:
    config = load_config()
    if manifest.get("sourceCommit") != PINNED_COMMIT:
        raise ValueError("manifest source commit mismatch")
    if manifest.get("toolchainDigest") != PINNED_DIGEST:
        raise ValueError("manifest toolchain digest mismatch")
    if manifest.get("modules") != config["modules"]:
        raise ValueError("manifest module list mismatch")
    if manifest.get("requiredSymbols") != config["symbolsByModule"]:
        raise ValueError("manifest required symbol whitelist mismatch")
    if manifest.get("gzipBytes") is not None and manifest["gzipBytes"] > GZIP_TARGET_BYTES:
        raise ValueError("manifest gzip size exceeds 8 MiB")
    if manifest.get("artifactPresent"):
        if artifact is None or not artifact.is_file():
            raise ValueError("manifest requires a present artifact")
        if manifest.get("sha256") != _sha256(artifact):
            raise ValueError("manifest SHA256 does not match artifact")
        if manifest.get("rawBytes") != artifact.stat().st_size:
            raise ValueError("manifest raw byte count does not match artifact")
        actual_gzip = len(gzip.compress(artifact.read_bytes(), compresslevel=9, mtime=0))
        if manifest.get("gzipBytes") != actual_gzip:
            raise ValueError("manifest gzip byte count does not match artifact")
    elif not manifest.get("dryRun"):
        raise ValueError("non-dry manifest must contain an artifact")


def _source_commit(source_dir: Path) -> str:
    try:
        return subprocess.run(
            ["git", "-C", str(source_dir), "rev-parse", "HEAD"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ValueError(f"Unable to validate OpenCV git source at {source_dir}") from exc


def docker_command(source_dir: Path, output_dir: Path, config: dict[str, Any]) -> list[str]:
    image = f'{config["toolchain"]["image"]}@{config["toolchain"]["digest"]}'
    flags = " ".join(config["build"]["emscriptenFlags"])
    source = "/opencv"
    output = "/out"
    command = (
        f"cd {source} && git apply --check /runtime/patches/{COMPATIBILITY_PATCH.name} && "
        f"git apply /runtime/patches/{COMPATIBILITY_PATCH.name} && rm -rf build_wasm && "
        f"python3 ./platforms/js/build_js.py build_wasm --build_wasm "
        f"--config /runtime/opencv_js.config.py "
        + " ".join(f"--cmake_option={shlex.quote(option)}" for option in config["build"]["cmakeOptions"])
        + " "
        f"--build_flags={shlex.quote(flags)} && "
        f"cp build_wasm/bin/opencv.js {output}/opencv.js"
    )
    return [
        "docker", "run", "--rm", "--volume", f"{source_dir.resolve()}:{source}",
        "--volume", f"{RUNTIME.resolve()}:/runtime:ro", "--volume", f"{output_dir.resolve()}:{output}",
        image, "bash", "-lc", command,
    ]


def run(args: argparse.Namespace) -> dict[str, Any]:
    config = load_config()
    source_dir = Path(args.source_dir).resolve() if args.source_dir else None
    output_dir = Path(args.output_dir).resolve()
    manifest_path = Path(args.manifest).resolve()
    if args.dry_run:
        manifest = {
            "schemaVersion": "lab004.opencv-manifest.v1",
            "dryRun": True,
            "artifactPresent": False,
            "artifactPath": config["artifact"]["pagesRelativePath"],
            "sourceCommit": PINNED_COMMIT,
            "sourceTag": config["source"]["tag"],
            "toolchainImage": PINNED_IMAGE,
            "toolchainDigest": PINNED_DIGEST,
            "modules": config["modules"],
            "buildFlags": config["build"],
            "sha256": None,
            "rawBytes": None,
            "gzipBytes": None,
            "gzipTargetBytes": GZIP_TARGET_BYTES,
            "requiredSymbols": config["symbolsByModule"],
        }
        validate_manifest(manifest)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print("Docker build not run (dry-run); pinned OpenCV runtime plan is valid.")
        return manifest
    if source_dir is None:
        raise ValueError("--source-dir is required for a real Docker build")
    if _source_commit(source_dir) != PINNED_COMMIT:
        raise ValueError("OpenCV source checkout is not at the pinned commit")
    if not COMPATIBILITY_PATCH.is_file():
        raise ValueError("Pinned OpenCV/Emscripten compatibility patch is missing")
    if shutil.which("docker") is None:
        raise RuntimeError("Docker is required for a real OpenCV.js build; use --dry-run locally")
    output_dir.mkdir(parents=True, exist_ok=True)
    command = docker_command(source_dir, output_dir, config)
    subprocess.run(command, check=True)
    artifact = output_dir / config["artifact"]["filename"]
    manifest = manifest_for_artifact(artifact)
    validate_manifest(manifest, artifact)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Built {artifact} with pinned Docker image {PINNED_IMAGE}@{PINNED_DIGEST}.")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="validate pins and emit a plan without Docker")
    parser.add_argument("--source-dir", help="OpenCV checkout at the pinned commit (CI real-build mode)")
    parser.add_argument("--output-dir", default=str(ROOT / "web" / "vendor"))
    parser.add_argument("--manifest", default=str(ROOT / "web" / "vendor" / "manifest.json"))
    try:
        run(parser.parse_args())
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"OpenCV runtime build failed: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
