"""Derive stable MP4 and GIF backups from the real Playwright app recording."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "demo"
WEBM = OUTPUT / "demo.webm"
FPS = 24
FRAME_COUNT = 12 * FPS
SIZE = (1080, 1350)


def source_metadata(capture: cv2.VideoCapture) -> tuple[int, float, int, int]:
    frame_count = int(round(capture.get(cv2.CAP_PROP_FRAME_COUNT)))
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    width = int(round(capture.get(cv2.CAP_PROP_FRAME_WIDTH)))
    height = int(round(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    if frame_count < 2 or fps <= 0 or width < 1 or height < 1:
        raise RuntimeError("demo.webm has invalid or unreadable video metadata")
    return frame_count, fps, width, height


def fit_frame(frame: np.ndarray) -> np.ndarray:
    """Contain a browser frame in the exact vertical delivery canvas."""
    source_height, source_width = frame.shape[:2]
    scale = min(SIZE[0] / source_width, SIZE[1] / source_height)
    width = max(1, round(source_width * scale))
    height = max(1, round(source_height * scale))
    resized = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)
    canvas = np.full((SIZE[1], SIZE[0], 3), (8, 17, 31), dtype=np.uint8)
    x = (SIZE[0] - width) // 2
    y = (SIZE[1] - height) // 2
    canvas[y : y + height, x : x + width] = resized
    return canvas


def derive_from_webm() -> None:
    capture = cv2.VideoCapture(str(WEBM))
    if not capture.isOpened():
        raise RuntimeError(
            "demo/demo.webm is missing. Run `node scripts/record_demo.mjs` first."
        )
    source_frames, source_fps, source_width, source_height = source_metadata(capture)
    wanted = np.rint(np.linspace(0, source_frames - 1, FRAME_COUNT)).astype(int)

    mp4_path = OUTPUT / "demo.mp4"
    writer = cv2.VideoWriter(
        str(mp4_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        FPS,
        SIZE,
    )
    if not writer.isOpened():
        capture.release()
        raise RuntimeError("OpenCV could not open the mp4v VideoWriter")

    gif_frames: list[Image.Image] = []
    wanted_index = 0
    source_index = 0
    last_frame: np.ndarray | None = None
    try:
        while wanted_index < FRAME_COUNT:
            ok, frame = capture.read()
            if not ok:
                break
            last_frame = fit_frame(frame)
            while wanted_index < FRAME_COUNT and wanted[wanted_index] == source_index:
                writer.write(last_frame)
                if wanted_index % 6 == 0:
                    rgb = cv2.cvtColor(last_frame, cv2.COLOR_BGR2RGB)
                    gif_frames.append(
                        Image.fromarray(rgb).resize((540, 675), Image.Resampling.LANCZOS)
                    )
                wanted_index += 1
            source_index += 1

        # Container frame-count rounding can occasionally be one frame optimistic.
        while wanted_index < FRAME_COUNT and last_frame is not None:
            writer.write(last_frame)
            if wanted_index % 6 == 0:
                rgb = cv2.cvtColor(last_frame, cv2.COLOR_BGR2RGB)
                gif_frames.append(
                    Image.fromarray(rgb).resize((540, 675), Image.Resampling.LANCZOS)
                )
            wanted_index += 1
    finally:
        capture.release()
        writer.release()

    if wanted_index != FRAME_COUNT or len(gif_frames) != FRAME_COUNT // 6:
        raise RuntimeError(
            f"Conversion produced {wanted_index} MP4 frames and {len(gif_frames)} GIF frames"
        )

    gif_frames[0].save(
        OUTPUT / "demo.gif",
        save_all=True,
        append_images=gif_frames[1:],
        duration=250,
        loop=0,
        optimize=False,
    )
    print(
        "Derived 288-frame MP4 and 48-frame GIF from "
        f"{source_frames} Playwright WebM frames "
        f"({source_width}x{source_height} at {source_fps:.2f} fps)."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--from-webm",
        action="store_true",
        help="derive MP4/GIF from demo/demo.webm (required)",
    )
    args = parser.parse_args()
    if not args.from_webm:
        parser.error(
            "The demo must come from the real app. Run `node scripts/record_demo.mjs`, "
            "or pass --from-webm after recording."
        )
    derive_from_webm()


if __name__ == "__main__":
    main()
