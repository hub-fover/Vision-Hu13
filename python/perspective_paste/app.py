"""OpenCV teaching application for perspective-aware compositing."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

from .blending import blend_composite
from .config import RENDER_PRESETS, get_render_preset
from .geometry import compute_vanishing_points
from .interaction import InteractionState
from .renderer import load_png_layer, render_text_layer


DEFAULT_TEXT = "先贴得准，再融得真"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BACKGROUND = PROJECT_ROOT / "assets" / "examples" / "wall.jpg"
PRESET_NAMES = tuple(RENDER_PRESETS)
BLUR_STEPS = (0.0, 0.5, 1.0, 1.5, 2.0, 2.5)


def cycle_blur(current: float) -> float:
    """Advance to the next documented blur step, wrapping after 2.5 px."""
    value = float(current)
    for step in BLUR_STEPS:
        if step > value + 1e-9:
            return step
    return BLUR_STEPS[0]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="perspective-paste",
        description="Teach perspective placement and realistic image blending.",
    )
    parser.add_argument("--background", type=Path, default=DEFAULT_BACKGROUND)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--text", default=DEFAULT_TEXT)
    source.add_argument("--asset", type=Path)
    parser.add_argument("--preset", choices=PRESET_NAMES, default="wall")
    parser.add_argument("--font", type=Path)
    parser.add_argument("--output", type=Path, default=Path("perspective-paste.png"))
    return parser


def downsample_preview(
    image: np.ndarray, max_edge: int = 1200
) -> tuple[np.ndarray, float]:
    """Return a preview and its scale relative to the full-resolution image."""
    height, width = image.shape[:2]
    scale = min(1.0, float(max_edge) / max(width, height))
    if scale == 1.0:
        return image.copy(), scale
    preview = cv2.resize(
        image,
        (max(1, round(width * scale)), max(1, round(height * scale))),
        interpolation=cv2.INTER_AREA,
    )
    return preview, scale


def export_image(image: np.ndarray, path: str | Path) -> Path:
    """Export PNG losslessly or JPEG at quality 92."""
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    layer = np.asarray(image)
    if layer.ndim != 3 or layer.shape[2] not in (3, 4):
        raise ValueError("export image must be RGB or RGBA")
    pil_image = Image.fromarray(layer.astype(np.uint8))
    suffix = output.suffix.lower()
    if suffix == ".png":
        pil_image.save(output, format="PNG", compress_level=6)
    elif suffix in {".jpg", ".jpeg"}:
        if pil_image.mode == "RGBA":
            background = Image.new("RGB", pil_image.size, "white")
            background.paste(pil_image, mask=pil_image.getchannel("A"))
            pil_image = background
        pil_image.save(output, format="JPEG", quality=92)
    else:
        raise ValueError("output extension must be .png, .jpg, or .jpeg")
    return output


def can_export(state: InteractionState) -> bool:
    """Return whether the four currently edited points form a valid quad."""
    return (
        len(state.points) == 4
        and state.error_code is None
        and state.last_valid_quad is not None
    )


def export_composite(
    background: np.ndarray,
    asset: np.ndarray,
    state: InteractionState,
    preview_scale: float,
    options: dict[str, Any],
    output: str | Path,
) -> Path:
    """Render and save only a valid current quadrilateral."""
    if not can_export(state):
        raise ValueError("Export requires a valid current quadrilateral.")
    full_quad = state.last_valid_quad / float(preview_scale)
    result = blend_composite(background, asset, full_quad, options)
    return export_image(result, output)


def export_composite_safely(
    background: np.ndarray,
    asset: np.ndarray,
    state: InteractionState,
    preview_scale: float,
    options: dict[str, Any],
    output: str | Path,
) -> str:
    """Export without terminating the interactive session on file-system errors."""
    try:
        exported = export_composite(
            background, asset, state, preview_scale, options, output
        )
    except (OSError, ValueError) as error:
        return f"Export failed: {output}: {error}"
    return f"Exported {exported}"


def _draw_overlay(
    rgb: np.ndarray,
    state: InteractionState,
    options: dict[str, Any],
    *,
    grid: bool,
    vanishing: bool,
    message: str | None,
) -> np.ndarray:
    frame = cv2.cvtColor(rgb[..., :3], cv2.COLOR_RGB2BGR)
    height, width = frame.shape[:2]
    if grid:
        for fraction in (1 / 3, 2 / 3):
            cv2.line(
                frame,
                (round(width * fraction), 0),
                (round(width * fraction), height - 1),
                (90, 90, 90),
                1,
                cv2.LINE_AA,
            )
            cv2.line(
                frame,
                (0, round(height * fraction)),
                (width - 1, round(height * fraction)),
                (90, 90, 90),
                1,
                cv2.LINE_AA,
            )
    if len(state.points) >= 2:
        points = np.asarray(state.points, dtype=np.int32)
        cv2.polylines(
            frame,
            [points],
            len(points) == 4,
            (20, 210, 255),
            2,
            cv2.LINE_AA,
        )
    for index, point in enumerate(state.points):
        center = tuple(np.rint(point).astype(int))
        color = (30, 80, 255) if index == state.selected_index else (20, 220, 255)
        cv2.circle(frame, center, 7, color, -1, cv2.LINE_AA)
        cv2.putText(
            frame,
            str(index + 1),
            (center[0] + 9, center[1] - 9),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            1,
            cv2.LINE_AA,
        )
    if vanishing and len(state.points) == 4:
        for point in compute_vanishing_points(state.points):
            if point is not None and 0 <= point[0] < width and 0 <= point[1] < height:
                cv2.drawMarker(
                    frame,
                    tuple(np.rint(point).astype(int)),
                    (255, 80, 30),
                    cv2.MARKER_CROSS,
                    18,
                    2,
                )
    lines = [
        f"{options['blendMode']}  opacity {options['opacity']:.2f}  "
        f"blur {options['blurPx']:.1f}px  "
        f"brightness {'on' if options['brightnessMatch'] else 'off'}  "
        f"shadow {'on' if options['shadow'].get('enabled') else 'off'}",
        "T text  P png  G grid  V vanishing  M blend  [ ] opacity  "
        "B blur  S save  R reset  Enter confirm  Esc quit",
    ]
    if state.error_message:
        lines.append(state.error_message)
    if message:
        lines.append(message)
    overlay_height = 20 + 24 * len(lines)
    cv2.rectangle(frame, (0, 0), (width, overlay_height), (0, 0, 0), -1)
    for index, line in enumerate(lines):
        color = (80, 120, 255) if line == state.error_message else (235, 235, 235)
        cv2.putText(
            frame,
            line,
            (12, 24 + index * 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.52,
            color,
            1,
            cv2.LINE_AA,
        )
    return frame


def _text_asset(text: str, font: Path | None) -> np.ndarray:
    return render_text_layer(
        text,
        font_path=font,
        font_size=96,
        color=(245, 245, 240),
        opacity=1.0,
        stroke_width=0,
        letter_spacing=2,
        line_spacing=8,
    )


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    if not arguments.background.is_file():
        raise FileNotFoundError(f"Background image not found: {arguments.background}")
    background = load_png_layer(arguments.background)[..., :3]
    preview_background, preview_scale = downsample_preview(background)
    if arguments.asset is not None:
        asset = load_png_layer(arguments.asset)
    else:
        asset = _text_asset(arguments.text or DEFAULT_TEXT, arguments.font)

    options = get_render_preset(arguments.preset)
    state = InteractionState(
        preview_background.shape[1], preview_background.shape[0]
    )
    window = "Perspective Paste"
    show_grid = False
    show_vanishing = False
    status: str | None = "Click four corners: top-left, top-right, bottom-right, bottom-left."

    def on_mouse(event: int, x: int, y: int, flags: int, _data: object) -> None:
        del flags
        if event == cv2.EVENT_LBUTTONDOWN:
            if state.select_nearest((x, y)) is None:
                state.add_point((x, y))
        elif event == cv2.EVENT_MOUSEMOVE and state.selected_index is not None:
            state.drag_selected((x, y))
        elif event == cv2.EVENT_LBUTTONUP:
            state.selected_index = None
        elif event == cv2.EVENT_RBUTTONDOWN:
            state.remove_nearest((x, y))

    cv2.namedWindow(window, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(window, on_mouse)
    blend_modes = ("normal", "multiply", "soft-light")
    while True:
        if state.last_valid_quad is not None:
            preview = blend_composite(
                preview_background, asset, state.last_valid_quad, options
            )
        else:
            preview = preview_background
        cv2.imshow(
            window,
            _draw_overlay(
                preview,
                state,
                options,
                grid=show_grid,
                vanishing=show_vanishing,
                message=status,
            ),
        )
        key = cv2.waitKey(20) & 0xFF
        if key == 255:
            continue
        status = None
        if key == 27:
            break
        if key in (10, 13):
            status = (
                "Current quadrilateral confirmed."
                if can_export(state)
                else "Choose a valid current four-point quadrilateral."
            )
        elif key in (ord("t"), ord("T")):
            value = input("Text: ").strip()
            if value:
                asset = _text_asset(value, arguments.font)
        elif key in (ord("p"), ord("P")):
            value = input("PNG path: ").strip()
            if value:
                try:
                    asset = load_png_layer(Path(value))
                except (OSError, ValueError) as error:
                    status = str(error)
        elif key in (ord("g"), ord("G")):
            show_grid = not show_grid
        elif key in (ord("v"), ord("V")):
            show_vanishing = not show_vanishing
        elif key in (ord("m"), ord("M")):
            current = blend_modes.index(options["blendMode"])
            options["blendMode"] = blend_modes[(current + 1) % len(blend_modes)]
        elif key == ord("["):
            options["opacity"] = max(0.0, float(options["opacity"]) - 0.05)
        elif key == ord("]"):
            options["opacity"] = min(1.0, float(options["opacity"]) + 0.05)
        elif key in (ord("b"), ord("B")):
            options["blurPx"] = cycle_blur(float(options["blurPx"]))
        elif key in (ord("s"), ord("S")):
            if not can_export(state):
                status = "Choose a valid current four-point quadrilateral before export."
            else:
                status = export_composite_safely(
                    background,
                    asset,
                    state,
                    preview_scale,
                    options,
                    arguments.output,
                )
        elif key in (ord("r"), ord("R")):
            state.reset()
    cv2.destroyAllWindows()
    return 0
