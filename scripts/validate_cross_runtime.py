"""Verify the Python and browser implementations against shared tolerances."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

import cv2
import numpy as np

from perspective_paste.blending import blend_composite
from perspective_paste.geometry import compute_homography


FIXTURES = json.loads(
    (ROOT / "shared" / "fixtures" / "geometry.json").read_text(encoding="utf-8")
)
IGNORED_EDGE_PIXELS = 2


def _project(matrix: np.ndarray, point: list[float]) -> np.ndarray:
    mapped = matrix @ np.asarray([point[0], point[1], 1.0], dtype=float)
    return mapped[:2] / mapped[2]


def _standard_images() -> tuple[np.ndarray, np.ndarray]:
    height, width = 48, 64
    yy, xx = np.mgrid[:height, :width]
    background = np.empty((height, width, 4), dtype=np.uint8)
    background[..., 0] = 45 + xx * 2
    background[..., 1] = 60 + yy * 2
    background[..., 2] = 90 + (xx + yy) // 2
    background[..., 3] = 255

    asset_height, asset_width = 16, 24
    ay, ax = np.mgrid[:asset_height, :asset_width]
    asset = np.empty((asset_height, asset_width, 4), dtype=np.uint8)
    asset[..., 0] = 40 + ax * 7
    asset[..., 1] = 185 - ay * 6
    asset[..., 2] = 80 + (ax + ay) * 3
    asset[..., 3] = 220
    return background, asset


def validate() -> dict[str, float | int]:
    background, asset = _standard_images()
    quad = [[8, 6], [55, 8], [52, 40], [10, 42]]
    options = {
        "blendMode": "normal",
        "opacity": 0.84,
        "blurPx": 0,
        "brightnessMatch": False,
        "tintStrength": 0,
        "textureStrength": 0,
        "saturation": 1,
        "shadow": {"enabled": False},
        "fitMode": "fill",
    }
    homography_cases = FIXTURES["homographies"]
    request = {
        "homographies": [
            {"source": case["source"], "destination": case["destination"]}
            for case in homography_cases
        ],
        "background": {
            "width": background.shape[1],
            "height": background.shape[0],
            "data": background.reshape(-1).tolist(),
        },
        "asset": {
            "width": asset.shape[1],
            "height": asset.shape[0],
            "data": asset.reshape(-1).tolist(),
        },
        "quad": quad,
        "options": options,
    }
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required for cross-runtime validation")
    completed = subprocess.run(
        [node, str(ROOT / "scripts" / "cross_runtime_web.mjs")],
        input=json.dumps(request),
        capture_output=True,
        check=True,
        text=True,
        cwd=ROOT,
    )
    web = json.loads(completed.stdout)

    maximum_reprojection_error = 0.0
    for case, web_matrix in zip(homography_cases, web["homographies"], strict=True):
        python_matrix = compute_homography(case["source"], case["destination"])
        web_matrix_array = np.asarray(web_matrix, dtype=float)
        for source_point, destination_point in zip(
            case["source"], case["destination"], strict=True
        ):
            destination = np.asarray(destination_point, dtype=float)
            python_projected = _project(python_matrix, source_point)
            web_projected = _project(web_matrix_array, source_point)
            maximum_reprojection_error = max(
                maximum_reprojection_error,
                float(np.linalg.norm(python_projected - destination)),
                float(np.linalg.norm(web_projected - destination)),
                float(np.linalg.norm(python_projected - web_projected)),
            )

    python_composite = blend_composite(background, asset, quad, options)
    web_composite = np.asarray(web["composite"], dtype=np.uint8).reshape(
        web["height"], web["width"], 4
    )
    mask = np.zeros(background.shape[:2], dtype=np.uint8)
    cv2.fillConvexPoly(mask, np.asarray(quad, dtype=np.int32), 255)
    kernel_size = IGNORED_EDGE_PIXELS * 2 + 1
    mask = cv2.erode(mask, np.ones((kernel_size, kernel_size), dtype=np.uint8))
    valid = mask > 0
    color_error = np.abs(
        python_composite[..., :3].astype(np.int16)
        - web_composite[..., :3].astype(np.int16)
    )
    mean_color_error_percent = float(color_error[valid].mean() / 255.0 * 100.0)
    return {
        "maximumReprojectionErrorPx": maximum_reprojection_error,
        "meanValidRegionColorErrorPercent": mean_color_error_percent,
        "ignoredEdgePixels": IGNORED_EDGE_PIXELS,
        "validPixels": int(valid.sum()),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    arguments = parser.parse_args()
    report = validate()
    if arguments.json:
        print(json.dumps(report, ensure_ascii=False))
    else:
        print(
            "Cross-runtime validation passed: "
            f"reprojection={report['maximumReprojectionErrorPx']:.6f}px, "
            f"mean color error={report['meanValidRegionColorErrorPercent']:.3f}%."
        )
    if report["maximumReprojectionErrorPx"] > 0.5:
        raise SystemExit("Reprojection error exceeds 0.5px")
    if report["meanValidRegionColorErrorPercent"] > 3.0:
        raise SystemExit("Mean valid-region color error exceeds 3%")


if __name__ == "__main__":
    main()
