"""Fetch, verify, extract, and size the official OpenCV.js 4.12 prebuilt."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import urllib.request
import zipfile


VERSION = "4.12.0"
ARCHIVE_NAME = "opencv-4.12.0-docs.zip"
SOURCE_URL = (
    "https://github.com/opencv/opencv/releases/download/"
    f"{VERSION}/{ARCHIVE_NAME}"
)
GZIP_TARGET_BYTES = 8 * 1024 * 1024
SCRIPT_DIR = Path(__file__).resolve().parent
VENDOR_DIR = SCRIPT_DIR.parent / "web" / "vendor"
OUTPUT = VENDOR_DIR / "opencv.js"
MANIFEST = VENDOR_DIR / "manifest.local.json"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download_archive(destination: Path) -> None:
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "Vision-Hu13-LAB002-vendor/1.0"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        with destination.open("wb") as output:
            shutil.copyfileobj(response, output)


def find_opencv_js(archive: zipfile.ZipFile) -> str:
    candidates = [
        name
        for name in archive.namelist()
        if name == "opencv.js" or name.endswith("/opencv.js")
    ]
    if not candidates:
        raise RuntimeError(f"{ARCHIVE_NAME} does not contain opencv.js")
    return min(candidates, key=lambda name: (name.count("/"), len(name)))


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Vendor the official OpenCV 4.12 documentation prebuilt. "
            "The runtime always loads the extracted file from the same origin."
        )
    )
    parser.add_argument(
        "--archive",
        type=Path,
        help="Use an already-downloaded official docs archive.",
    )
    parser.add_argument(
        "--expected-archive-sha256",
        help="Fail unless the archive has this SHA-256.",
    )
    parser.add_argument(
        "--expected-artifact-sha256",
        help="Fail unless the extracted opencv.js has this SHA-256.",
    )
    parser.add_argument(
        "--allow-oversize",
        action="store_true",
        help="Write an artifact above the 8MiB gzip target, but report it.",
    )
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="lab002-opencv-") as directory:
        temporary_archive = Path(directory) / ARCHIVE_NAME
        archive_path = args.archive
        if archive_path is None:
            print(f"Downloading official OpenCV {VERSION} docs archive:")
            print(SOURCE_URL)
            download_archive(temporary_archive)
            archive_path = temporary_archive
        archive_bytes = archive_path.read_bytes()
        archive_hash = sha256(archive_bytes)
        if (
            args.expected_archive_sha256
            and archive_hash.lower() != args.expected_archive_sha256.lower()
        ):
            raise RuntimeError(
                "Archive SHA-256 mismatch: "
                f"expected {args.expected_archive_sha256}, got {archive_hash}"
            )

        with zipfile.ZipFile(archive_path) as archive:
            entry = find_opencv_js(archive)
            artifact = archive.read(entry)

    artifact_hash = sha256(artifact)
    if (
        args.expected_artifact_sha256
        and artifact_hash.lower() != args.expected_artifact_sha256.lower()
    ):
        raise RuntimeError(
            "opencv.js SHA-256 mismatch: "
            f"expected {args.expected_artifact_sha256}, got {artifact_hash}"
        )
    gzip_bytes = len(gzip.compress(artifact, compresslevel=9, mtime=0))
    oversize = gzip_bytes > GZIP_TARGET_BYTES
    record = {
        "version": VERSION,
        "sourceUrl": SOURCE_URL,
        "archiveEntry": entry,
        "archiveSha256": archive_hash,
        "artifactSha256": artifact_hash,
        "rawBytes": len(artifact),
        "gzipBytes": gzip_bytes,
        "gzipTargetBytes": GZIP_TARGET_BYTES,
        "gzipTargetMet": not oversize,
        "requiredModules": ["core", "imgproc", "features2d", "calib3d"],
        "license": "Apache-2.0",
    }
    print(json.dumps(record, ensure_ascii=False, indent=2))
    if oversize and not args.allow_oversize:
        print(
            "OpenCV.js is above the 8MiB compressed target. "
            "No runtime algorithm or module was silently removed."
        )
        return 2

    VENDOR_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(artifact)
    MANIFEST.write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Vendored same-origin runtime: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
