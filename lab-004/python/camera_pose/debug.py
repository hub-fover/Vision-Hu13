"""Opt-in deterministic debug artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Mapping, Sequence

import cv2
import numpy as np
from numpy.typing import ArrayLike


class DebugWriter:
    def __init__(self, directory: str | Path):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def write_json(self, name: str, payload: Mapping[str, object] | Sequence[object]) -> Path:
        path = self.directory / f"{_safe_name(name)}.json"
        path.write_text(json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
        return path

    def write_corner_overlay(self, name: str, image: ArrayLike, points: ArrayLike, *, accepted: bool) -> Path:
        canvas = np.asarray(image).copy()
        if canvas.ndim == 2:
            canvas = cv2.cvtColor(canvas.astype(np.uint8), cv2.COLOR_GRAY2BGR)
        else:
            canvas = canvas.astype(np.uint8)
        quad = np.rint(np.asarray(points, np.float64)).astype(np.int32)
        color = (40, 190, 40) if accepted else (30, 30, 220)
        cv2.polylines(canvas, [quad], True, color, 2, cv2.LINE_AA)
        for index, point in enumerate(quad):
            cv2.circle(canvas, tuple(point), 4, color, -1)
            cv2.putText(canvas, ("TL", "TR", "BR", "BL")[index], tuple(point + [5, -5]), cv2.FONT_HERSHEY_SIMPLEX, .45, color, 1, cv2.LINE_AA)
        path = self.directory / f"{_safe_name(name)}.{('accepted' if accepted else 'rejected')}.png"
        cv2.imwrite(str(path), canvas)
        return path


def _safe_name(value: str) -> str:
    return "".join(character if character.isalnum() or character in "-_" else "_" for character in value)
