from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "python") not in sys.path:
    sys.path.insert(0, str(ROOT / "python"))

from exposure_fusion.contracts import FusionOptions
from exposure_fusion.fusion import estimate_working_set_mib, fuse_exposures
from exposure_fusion.pyramid import fuse_pyramids
from exposure_fusion.weights import compute_quality_weights

def fixture() -> np.ndarray:
    width, height = 64, 48
    images = []
    for exposure in (0.55, 1.0, 1.65):
        image = np.empty((height, width, 3), dtype=np.uint8)
        for y in range(height):
            for x in range(width):
                base = 24 + x * 2.2 + y * 1.4 + ((x >> 3) % 2) * 28 + ((y >> 3) % 2) * 19
                values = (base * exposure, (base * .84 + 18) * exposure, (base * .68 + 31) * exposure)
                image[y, x] = np.clip(np.round(values), 0, 255)
        images.append(image)
    return np.stack(images)


def main() -> None:
    completed = subprocess.run(
        ["node", str(ROOT / "scripts" / "cross_runtime_web.mjs")],
        check=True,
        capture_output=True,
        text=True,
    )
    web = json.loads(completed.stdout)
    images = fixture()
    options = FusionOptions(motion_protection=False)
    weights, _ = compute_quality_weights(images, options)
    python = np.clip(np.round(fuse_pyramids(images, weights, options.pyramid_levels) * 255), 0, 255).astype(np.uint8)
    javascript = np.asarray(web["fusionRgb"], dtype=np.uint8).reshape(web["height"], web["width"], 3)
    mean_color_difference = float(np.mean(np.abs(python.astype(np.int16) - javascript.astype(np.int16))) / 255)
    assert web["maxControlPointErrorPx"] <= 2.0, web["maxControlPointErrorPx"]
    assert mean_color_difference <= 0.05, mean_color_difference
    assert estimate_working_set_mib(2000, 2000) <= 320
    kebun_root = ROOT / "assets" / "sources" / "kebun"
    kebun = fuse_exposures([kebun_root / "9.jpg", kebun_root / "6.jpg", kebun_root / "3.jpg"])
    assert kebun.image.size > 0
    assert kebun.report.output_width * kebun.report.output_height <= options.max_output_pixels
    assert all(item.inlier_count >= options.min_inliers for item in kebun.report.alignments)
    print(json.dumps({
        "maxControlPointErrorPx": web["maxControlPointErrorPx"],
        "meanFusionColorDifference": mean_color_difference,
        "workingSetAt4MpMiB": estimate_working_set_mib(2000, 2000),
        "kebunExposureSpread": kebun.report.exposure.relative_spread,
        "kebunAlignmentInliers": [item.inlier_count for item in kebun.report.alignments],
        "kebunOutputPixels": kebun.report.output_width * kebun.report.output_height,
    }, indent=2))


if __name__ == "__main__":
    main()
