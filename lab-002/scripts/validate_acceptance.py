"""Run reproducible LAB 002 cross-runtime and release acceptance gates."""

from __future__ import annotations

import argparse
import gzip
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np

SCRIPT_LAB_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPT_LAB_ROOT / "python") not in sys.path:
    sys.path.insert(0, str(SCRIPT_LAB_ROOT / "python"))

from panorama_stitch import (
    StitchOptions,
    auto_crop,
    blend_panorama,
    compose_transforms,
    plan_canvas,
    stitch_images,
)


THRESHOLDS = {
    "maximumTransformDifferencePx": 2,
    "maximumMedianReprojectionErrorPx": 2.5,
    "meanValidAreaColorDifferencePercent": 5,
    "maxWorkingSetMiB": 384,
    "opencvCompressedBytes": 8 * 1024 * 1024,
}
SEAM_EXCLUSION_RADIUS = 2
REMOTE_URL = re.compile(r"https?://", re.IGNORECASE)
FORBIDDEN_RUNTIME_APIS = re.compile(
    r"\b(?:XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|"
    r"indexedDB|google-analytics|googletagmanager)\b",
    re.IGNORECASE,
)


def _project(matrix: np.ndarray, point: list[float]) -> np.ndarray:
    homogeneous = matrix @ np.asarray([point[0], point[1], 1.0], dtype=float)
    return homogeneous[:2] / homogeneous[2]


def _color_fixture() -> tuple[list[np.ndarray], list[np.ndarray]]:
    height, width = 40, 64
    yy, xx = np.mgrid[:height, :width]
    base = np.stack(
        (
            35 + xx * 2,
            50 + yy * 3,
            75 + (xx + yy),
        ),
        axis=-1,
    ).astype(np.uint8)
    images = [base.copy(), np.clip(base.astype(np.int16) + 2, 0, 255).astype(np.uint8)]
    masks = [
        np.pad(np.ones((height, 42), dtype=np.uint8) * 255, ((0, 0), (0, 22))),
        np.pad(np.ones((height, 42), dtype=np.uint8) * 255, ((0, 0), (22, 0))),
    ]
    return images, masks


def _cross_runtime_request() -> tuple[dict[str, Any], list[np.ndarray], list[np.ndarray]]:
    adjacent = [
        np.asarray(
            [[1.001, 0.004, 118], [-0.003, 1.002, 7], [0.00001, -0.00002, 1]],
            dtype=np.float64,
        ),
        np.asarray(
            [[0.999, -0.003, 112], [0.002, 1.001, -5], [-0.00001, 0.00002, 1]],
            dtype=np.float64,
        ),
    ]
    controls = [
        [[0, 0], [800, 0], [800, 500], [0, 500], [400, 250]],
        [[0, 0], [800, 0], [800, 500], [0, 500], [400, 250]],
        [[0, 0], [800, 0], [800, 500], [0, 500], [400, 250]],
    ]
    color_images, color_masks = _color_fixture()
    crop_mask = np.ones((30, 48), dtype=np.uint8) * 255
    crop_mask[:2] = 0
    crop_mask[-2:] = 0
    crop_mask[:, :3] = 0
    crop_mask[:, -3:] = 0
    crop_mask[8:22, 23:25] = 0
    options = StitchOptions()
    request = {
        "adjacentHomographies": [matrix.reshape(-1).tolist() for matrix in adjacent],
        "imageCount": 3,
        "controlPoints": controls,
        "images": [
            {"name": f"fixture-{index}.jpg", "width": 800, "height": 500}
            for index in range(3)
        ],
        "options": options.to_shared_dict(),
        "color": {
            "width": color_images[0].shape[1],
            "height": color_images[0].shape[0],
            "images": [image.reshape(-1, 3).tolist() for image in color_images],
            "masks": [mask.reshape(-1).tolist() for mask in color_masks],
        },
        "crop": {
            "width": crop_mask.shape[1],
            "height": crop_mask.shape[0],
            "mask": crop_mask.reshape(-1).tolist(),
        },
    }
    return request, color_images, color_masks


def _run_web(lab_root: Path, request: dict[str, Any]) -> dict[str, Any]:
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("Node.js is required for LAB 002 cross-runtime acceptance")
    completed = subprocess.run(
        [node, str(lab_root / "scripts" / "cross_runtime_web.mjs")],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        check=True,
        cwd=lab_root,
    )
    return json.loads(completed.stdout)


def _validate_runtime_privacy(lab_root: Path) -> list[str]:
    errors: list[str] = []
    runtime_files = [
        lab_root / "web" / "index.html",
        lab_root / "web" / "styles.css",
        *(lab_root / "web" / "js").glob("*.js"),
    ]
    for path in runtime_files:
        source = path.read_text("utf-8")
        if REMOTE_URL.search(source):
            errors.append(f"remote runtime URL in {path.relative_to(lab_root)}")
        if FORBIDDEN_RUNTIME_APIS.search(source):
            errors.append(f"analytics/storage/network API in {path.relative_to(lab_root)}")
    worker = (lab_root / "web" / "js" / "panorama.worker.js").read_text("utf-8")
    if 'importScripts("../vendor/opencv.js")' not in worker:
        errors.append("Worker must load same-origin ../vendor/opencv.js")
    if "opencv.js" in (lab_root / "web" / "index.html").read_text("utf-8"):
        errors.append("OpenCV must be lazy-loaded by the Worker, not index.html")
    app = (lab_root / "web" / "js" / "app.js").read_text("utf-8")
    if re.search(r"\b(?:upload|remoteProcess)\s*\(", app, re.IGNORECASE):
        errors.append("Web app contains an image upload/remote-processing call")

    manifest = json.loads(
        (lab_root / "web" / "assets" / "samples" / "manifest.json").read_text("utf-8")
    )
    for sequence_id, sequence in manifest.get("sequences", {}).items():
        for relative in sequence.get("files", []):
            if not re.match(r"^\.[/\\]", relative) or REMOTE_URL.search(relative):
                errors.append(f"{sequence_id} runtime sample is not same-origin: {relative}")
    return errors


def _opencv_compressed_bytes(lab_root: Path) -> int:
    candidates = (
        lab_root / "web" / "vendor" / "opencv.js",
        lab_root
        / "web"
        / "node_modules"
        / "@techstark"
        / "opencv-js"
        / "dist"
        / "opencv.js",
    )
    source = next((path for path in candidates if path.is_file()), None)
    if source is None:
        raise FileNotFoundError(
            "OpenCV.js is not installed; run npm ci --prefix web and vendor:opencv"
        )
    return len(gzip.compress(source.read_bytes(), compresslevel=9, mtime=0))


def validate_acceptance(lab_root: Path) -> tuple[dict[str, Any], list[str]]:
    """Return a machine-readable report and every violated release gate."""

    lab_root = Path(lab_root).resolve()
    request, color_images, color_masks = _cross_runtime_request()
    web = _run_web(lab_root, request)
    adjacent = [
        np.asarray(matrix, dtype=np.float64).reshape(3, 3)
        for matrix in request["adjacentHomographies"]
    ]
    python_transforms = compose_transforms(adjacent, image_count=3)
    maximum_transform_difference = 0.0
    for image_index, transform in enumerate(python_transforms):
        for point, web_point in zip(
            request["controlPoints"][image_index],
            web["projectedControlPoints"][image_index],
            strict=True,
        ):
            maximum_transform_difference = max(
                maximum_transform_difference,
                float(np.linalg.norm(_project(transform, point) - web_point)),
            )

    python_blend = blend_panorama(color_images, color_masks)
    web_rgba = np.asarray(web["blend"]["image"], dtype=np.uint8).reshape(
        request["color"]["height"], request["color"]["width"], 4
    )
    web_valid = np.asarray(web["blend"]["validMask"], dtype=np.uint8).reshape(
        python_blend.valid_mask.shape
    )
    web_seam = np.asarray(web["blend"]["seamMask"], dtype=np.uint8).reshape(
        python_blend.valid_mask.shape
    )
    seam = python_blend.seam_mask | (web_seam > 0)
    seam_boundary = cv2.dilate(
        seam.astype(np.uint8),
        np.ones((SEAM_EXCLUSION_RADIUS * 2 + 1,) * 2, dtype=np.uint8),
    ).astype(bool)
    comparable = python_blend.valid_mask & (web_valid > 0) & ~seam_boundary
    if not np.any(comparable):
        raise RuntimeError("Cross-runtime color fixture has no comparable valid pixels")
    color_error = np.abs(
        python_blend.image.astype(np.int16) - web_rgba[..., :3].astype(np.int16)
    )
    mean_color_difference = float(color_error[comparable].mean() / 255 * 100)

    crop_mask = np.asarray(request["crop"]["mask"], dtype=np.uint8).reshape(
        request["crop"]["height"], request["crop"]["width"]
    )
    python_crop = auto_crop(crop_mask)
    cropped_mask = python_crop.apply(crop_mask)
    web_crop = web["crop"]
    safe_crop_has_holes = bool(
        not np.all(cropped_mask)
        or (
            python_crop.x,
            python_crop.y,
            python_crop.width,
            python_crop.height,
        )
        != (
            web_crop["x"],
            web_crop["y"],
            web_crop["width"],
            web_crop["height"],
        )
    )

    shapes = [(image["height"], image["width"]) for image in request["images"]]
    budgets: dict[str, dict[str, float]] = {}
    for quality in ("mobile", "hd"):
        python_plan = plan_canvas(shapes, python_transforms, quality=quality)
        web_plan = web["plans"][quality]
        budgets[quality] = {
            "outputMegapixels": max(
                python_plan.canvas_size[0] * python_plan.canvas_size[1],
                web_plan["width"] * web_plan["height"],
            )
            / 1_000_000,
            "estimatedWorkingSetMiB": max(
                python_plan.estimated_working_set_mib,
                float(web_plan["estimatedWorkingSetMiB"]),
            ),
        }

    mountain_paths = sorted(
        (lab_root / "python" / "panorama_stitch" / "samples" / "mountains").glob("*.jpg")
    )
    mountain = stitch_images(mountain_paths, quality="mobile")
    maximum_median_error = max(
        metric.median_reprojection_error_px for metric in mountain.match_metrics
    )
    compressed_bytes = _opencv_compressed_bytes(lab_root)
    privacy_errors = _validate_runtime_privacy(lab_root)
    report: dict[str, Any] = {
        "thresholds": THRESHOLDS,
        "maximumTransformDifferencePx": maximum_transform_difference,
        "maximumMedianReprojectionErrorPx": maximum_median_error,
        "meanValidAreaColorDifferencePercent": mean_color_difference,
        "seamBoundaryExcludedPixels": int(np.count_nonzero(seam_boundary)),
        "safeCropHasBlankHoles": safe_crop_has_holes,
        "budgets": budgets,
        "mountainSample": {
            "validPanorama": bool(mountain.image.size and mountain.image.shape[1] > mountain.image.shape[0]),
            "inputCount": len(mountain_paths),
            "outputPixels": int(mountain.image.shape[0] * mountain.image.shape[1]),
        },
        "opencvCompressedBytes": compressed_bytes,
        "privacyStaticResources": "PASS" if not privacy_errors else "FAIL",
    }
    errors = list(privacy_errors)
    for key in (
        "maximumTransformDifferencePx",
        "maximumMedianReprojectionErrorPx",
        "meanValidAreaColorDifferencePercent",
    ):
        if report[key] > THRESHOLDS[key]:
            errors.append(f"{key} exceeds {THRESHOLDS[key]}")
    if safe_crop_has_holes:
        errors.append("safe crop contains a blank hole or differs across runtimes")
    for quality, limit in (("mobile", 12), ("hd", 24)):
        if budgets[quality]["outputMegapixels"] > limit:
            errors.append(f"{quality} output exceeds {limit}MP")
        if budgets[quality]["estimatedWorkingSetMiB"] > THRESHOLDS["maxWorkingSetMiB"]:
            errors.append(f"{quality} estimated working set exceeds 384MiB")
    if not report["mountainSample"]["validPanorama"]:
        errors.append("committed mountain sample did not produce a valid panorama")
    if compressed_bytes > THRESHOLDS["opencvCompressedBytes"]:
        errors.append("compressed OpenCV.js exceeds 8MiB")
    return report, errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "lab_root",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    arguments = parser.parse_args()
    report, errors = validate_acceptance(arguments.lab_root)
    if arguments.json:
        print(json.dumps(report, ensure_ascii=False))
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit("\n".join(f"- {error}" for error in errors))


if __name__ == "__main__":
    main()
