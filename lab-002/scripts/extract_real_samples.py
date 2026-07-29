"""Extract reproducible real-photo sequences from the approved Pexels videos.

Source MP4 files stay outside the repository. This script only writes the
documented 1600px/JPEG-90 derivative frames and their provenance manifests.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class Source:
    id: str
    title: str
    creator: str
    video_id: str
    page_url: str
    direct_url: str
    source_file: str
    fractions: tuple[float, ...]
    usage: str


SOURCES = (
    Source(
        id="mountains",
        title="Camera Panning Over Mountains",
        creator="cottonbro studio",
        video_id="9943097",
        page_url="https://www.pexels.com/video/camera-panning-over-mountains-9943097/",
        direct_url=(
            "https://videos.pexels.com/video-files/9943097/"
            "9943097-uhd_4096_2160_25fps.mp4"
        ),
        source_file="mountains-9943097.mp4",
        fractions=(0.30, 0.45, 0.60),
        usage="Default successful panorama sample for Python and Web.",
    ),
    Source(
        id="city",
        title="Panoramic Cityscape of Modern Urban Skyline",
        creator="Zulfugar Karimov",
        video_id="36722864",
        page_url=(
            "https://www.pexels.com/video/"
            "panoramic-cityscape-of-modern-urban-skyline-36722864/"
        ),
        direct_url=(
            "https://videos.pexels.com/video-files/36722864/"
            "15563861_3840_2160_30fps.mp4"
        ),
        source_file="city-36722864.mp4",
        fractions=(0.20, 0.35, 0.50, 0.65),
        usage="Four-image urban panorama sample for Web and acceptance checks.",
    ),
    Source(
        id="ocean",
        title="Panning Shot of Ocean",
        creator="James Cheney",
        video_id="6746361",
        page_url="https://www.pexels.com/video/panning-shot-of-ocean-6746361/",
        direct_url=(
            "https://videos.pexels.com/video-files/6746361/"
            "6746361-uhd_3840_2160_24fps.mp4"
        ),
        source_file="ocean-6746361.mp4",
        fractions=(0.30, 0.45, 0.60),
        usage="Real low-texture failure sample for Web and diagnostics.",
    ),
)

TRANSFORMATIONS = [
    "Decoded the original video frame nearest to each documented fractional timestamp.",
    "Applied decoded orientation (landscape) and a centered 16:9 crop without synthetic fill.",
    "Applied bounded gray-world color correction with per-channel gains limited to 0.96–1.04.",
    "Resized with Lanczos interpolation so the longest edge is 1600px.",
    "Encoded as JPEG at quality 90; no generative or programmatic scene content was added.",
]


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_jpeg(path: Path, image: np.ndarray) -> None:
    """Write JPEG-90 through a byte buffer so Windows Unicode paths work."""

    path.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(
        ".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90]
    )
    if not ok:
        raise RuntimeError(f"Could not encode {path}")
    encoded.tofile(path)


def _center_crop_16_9(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    target_ratio = 16 / 9
    current_ratio = width / height
    if current_ratio > target_ratio:
        target_width = int(round(height * target_ratio))
        left = (width - target_width) // 2
        return image[:, left : left + target_width]
    target_height = int(round(width / target_ratio))
    top = (height - target_height) // 2
    return image[top : top + target_height, :]


def _bounded_gray_world(image: np.ndarray) -> np.ndarray:
    means = image.reshape(-1, 3).mean(axis=0)
    target = float(means.mean())
    gains = np.clip(target / np.maximum(means, 1.0), 0.96, 1.04)
    return np.clip(image.astype(np.float32) * gains, 0, 255).astype(np.uint8)


def _resize_1600(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    scale = 1600 / max(width, height)
    output_size = (round(width * scale), round(height * scale))
    return cv2.resize(image, output_size, interpolation=cv2.INTER_LANCZOS4)


def _extract_sequence(
    source: Source, video_dir: Path, lab_root: Path
) -> dict[str, object]:
    video_path = video_dir / source.source_file
    if not video_path.is_file():
        raise FileNotFoundError(f"Missing approved source video: {video_path}")
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"OpenCV could not decode {video_path}")
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = frame_count / fps
    canonical_dir = lab_root / "assets" / "samples" / source.id
    web_dir = lab_root / "web" / "assets" / "samples" / source.id
    canonical_dir.mkdir(parents=True, exist_ok=True)
    web_dir.mkdir(parents=True, exist_ok=True)
    python_dir = (
        lab_root / "python" / "panorama_stitch" / "samples" / "mountains"
        if source.id == "mountains"
        else None
    )
    if python_dir:
        python_dir.mkdir(parents=True, exist_ok=True)

    frames: list[dict[str, object]] = []
    try:
        for index, fraction in enumerate(source.fractions, start=1):
            requested_seconds = duration * fraction
            requested_frame = min(
                frame_count - 1, max(0, int(round(requested_seconds * fps)))
            )
            capture.set(cv2.CAP_PROP_POS_FRAMES, requested_frame)
            ok, frame = capture.read()
            if not ok or frame is None:
                raise RuntimeError(
                    f"Could not decode {source.id} at frame {requested_frame}"
                )
            decoded_frame = int(capture.get(cv2.CAP_PROP_POS_FRAMES)) - 1
            processed = _resize_1600(_bounded_gray_world(_center_crop_16_9(frame)))
            filename = f"{index:02d}.jpg"
            canonical = canonical_dir / filename
            _write_jpeg(canonical, processed)
            local_files = [
                canonical.relative_to(lab_root).as_posix(),
                (web_dir / filename).relative_to(lab_root).as_posix(),
            ]
            shutil.copyfile(canonical, web_dir / filename)
            if python_dir:
                shutil.copyfile(canonical, python_dir / filename)
                local_files.append(
                    (python_dir / filename).relative_to(lab_root).as_posix()
                )
            frames.append(
                {
                    "index": index,
                    "fraction": fraction,
                    "seconds": round(requested_seconds, 3),
                    "decodedFrameIndex": decoded_frame,
                    "decodedSeconds": round(decoded_frame / fps, 3),
                    "sha256": _sha256(canonical),
                    "localFiles": local_files,
                }
            )
    finally:
        capture.release()

    return {
        "id": source.id,
        "title": source.title,
        "creator": source.creator,
        "videoId": source.video_id,
        "sourceUrl": source.page_url,
        "license": "Pexels License",
        "licenseUrl": "https://www.pexels.com/legal-pages/license/",
        "downloadedAt": "2026-07-29",
        "directVideoUrl": source.direct_url,
        "directVideoFile": Path(source.direct_url).name,
        "measuredVideo": {
            "width": width,
            "height": height,
            "fps": round(fps, 6),
            "frameCount": frame_count,
            "durationSeconds": round(duration, 6),
        },
        "transformations": TRANSFORMATIONS,
        "usage": source.usage,
        "frames": frames,
        "isGenerated": False,
        "isThirdParty": True,
    }


def extract_all(video_dir: Path, lab_root: Path) -> None:
    sequences = [
        _extract_sequence(source, video_dir.resolve(), lab_root.resolve())
        for source in SOURCES
    ]
    asset_manifest = {
        "schemaVersion": 1,
        "generatedAt": "2026-07-29",
        "notice": (
            "These are documented derivatives of real Pexels videos. They are "
            "not original Vision Hub or CC BY 4.0 assets."
        ),
        "sequences": sequences,
    }
    manifest_path = lab_root / "assets" / "asset-manifest.json"
    manifest_path.write_text(
        json.dumps(asset_manifest, ensure_ascii=False, indent=2) + "\n",
        "utf-8",
    )
    web_manifest = {
        "schemaVersion": 1,
        "defaultSequence": "mountains",
        "sequences": {
            sequence["id"]: {
                "title": sequence["title"],
                "creator": sequence["creator"],
                "sourceUrl": sequence["sourceUrl"],
                "license": sequence["license"],
                "files": [
                    f"./{sequence['id']}/{frame['index']:02d}.jpg"
                    for frame in sequence["frames"]
                ],
                "isGenerated": False,
                "isThirdParty": True,
            }
            for sequence in sequences
        },
    }
    web_manifest_path = lab_root / "web" / "assets" / "samples" / "manifest.json"
    web_manifest_path.parent.mkdir(parents=True, exist_ok=True)
    web_manifest_path.write_text(
        json.dumps(web_manifest, ensure_ascii=False, indent=2) + "\n",
        "utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--video-dir",
        type=Path,
        default=Path(r"C:\tmp\lab002-real-videos"),
        help="Ignored directory containing the three approved Pexels MP4 files.",
    )
    parser.add_argument(
        "--lab-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    arguments = parser.parse_args()
    extract_all(arguments.video_dir, arguments.lab_root)
