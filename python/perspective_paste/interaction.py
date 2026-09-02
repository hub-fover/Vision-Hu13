"""GUI-independent point editing state."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

import numpy as np

from .geometry import GeometryError, order_quad, validate_quad


ERROR_MESSAGES = {
    "OUT_OF_BOUNDS": "Every point must lie inside the canvas.",
    "DUPLICATE_POINTS": "Points must be separated by the minimum point distance.",
    "SELF_INTERSECTION": "Quadrilateral edges must not cross.",
    "NON_CONVEX": "Quadrilateral must be convex.",
    "NEAR_COLLINEAR": "No three adjacent points may be nearly collinear.",
    "AREA_TOO_SMALL": "Quadrilateral area is below the minimum usable area.",
    "TOO_SLENDER": "Shortest-to-longest edge ratio is below the minimum.",
    "SINGULAR_HOMOGRAPHY": "A stable homography cannot be computed.",
}


@dataclass
class InteractionState:
    width: int
    height: int
    points: list[tuple[float, float]] | Iterable[tuple[float, float]] = field(
        default_factory=list
    )
    hit_radius: float = 16.0
    selected_index: int | None = field(default=None, init=False)
    last_valid_quad: np.ndarray | None = field(default=None, init=False)
    error_code: str | None = field(default=None, init=False)
    error_message: str | None = field(default=None, init=False)

    def __post_init__(self) -> None:
        self.width = int(self.width)
        self.height = int(self.height)
        self.points = [(float(x), float(y)) for x, y in self.points]
        if len(self.points) > 4:
            raise ValueError("InteractionState accepts at most four points")
        self._validate()

    def _validate(self) -> None:
        if len(self.points) != 4:
            self.last_valid_quad = None
            self.error_code = None
            self.error_message = None
            return
        try:
            candidate = (
                order_quad(self.points)
                if self.last_valid_quad is None
                else self.points
            )
            validated = validate_quad(candidate, self.width, self.height)
        except GeometryError as error:
            self.error_code = error.code
            self.error_message = ERROR_MESSAGES.get(error.code, str(error))
        else:
            self.points = [tuple(map(float, point)) for point in validated]
            self.last_valid_quad = validated
            self.error_code = None
            self.error_message = None

    def _nearest(self, point: tuple[float, float]) -> int | None:
        if not self.points:
            return None
        target = np.asarray(point, dtype=float)
        values = np.asarray(self.points, dtype=float)
        distances = np.linalg.norm(values - target, axis=1)
        index = int(np.argmin(distances))
        return index if distances[index] <= float(self.hit_radius) else None

    def add_point(self, point: tuple[float, float]) -> bool:
        if len(self.points) >= 4:
            return False
        self.points.append((float(point[0]), float(point[1])))
        self.selected_index = len(self.points) - 1
        self._validate()
        return True

    def select_nearest(self, point: tuple[float, float]) -> int | None:
        self.selected_index = self._nearest(point)
        return self.selected_index

    def drag_selected(self, point: tuple[float, float]) -> bool:
        if self.selected_index is None:
            return False
        self.points[self.selected_index] = (float(point[0]), float(point[1]))
        self._validate()
        return True

    def remove_nearest(self, point: tuple[float, float]) -> bool:
        index = self._nearest(point)
        if index is None:
            return False
        self.points.pop(index)
        self.selected_index = None
        self._validate()
        return True

    def reset(self) -> None:
        self.points.clear()
        self.selected_index = None
        self.last_valid_quad = None
        self.error_code = None
        self.error_message = None
