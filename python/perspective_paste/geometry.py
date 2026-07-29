"""Runtime-independent quadrilateral and projective geometry."""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np


MAX_CONDITION = 1e8
MAX_REPROJECTION_ERROR = 0.5
PARALLEL_EPSILON = 1e-10
NEAR_COLLINEAR_SINE = 1e-3


class GeometryError(ValueError):
    """A geometry failure with a cross-runtime stable error code."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _points(
    value: Sequence[Sequence[float]], error_code: str = "NON_CONVEX"
) -> np.ndarray:
    try:
        points = np.asarray(value, dtype=float)
    except (TypeError, ValueError, OverflowError) as error:
        raise GeometryError(error_code) from error
    if points.shape != (4, 2) or not np.isfinite(points).all():
        raise GeometryError(error_code)
    return points


def _signed_area(points: np.ndarray) -> float:
    return 0.5 * float(
        np.dot(points[:, 0], np.roll(points[:, 1], -1))
        - np.dot(points[:, 1], np.roll(points[:, 0], -1))
    )


def order_quad(points: Sequence[Sequence[float]]) -> np.ndarray:
    """Return four unordered points in TL, TR, BR, BL screen order."""
    result = _points(points)
    center = result.mean(axis=0)
    angles = np.arctan2(result[:, 1] - center[1], result[:, 0] - center[0])
    result = result[np.argsort(angles)]
    if _signed_area(result) < 0:
        result = result[::-1]
    start = int(np.argmin(result[:, 0] + result[:, 1]))
    return np.roll(result, -start, axis=0).copy()


def _cross(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ab = b - a
    bc = c - b
    return float(ab[0] * bc[1] - ab[1] * bc[0])


def _segments_cross(a: np.ndarray, b: np.ndarray, c: np.ndarray, d: np.ndarray) -> bool:
    def orientation(p: np.ndarray, q: np.ndarray, r: np.ndarray) -> float:
        pq = q - p
        pr = r - p
        return float(pq[0] * pr[1] - pq[1] * pr[0])

    return orientation(a, b, c) * orientation(a, b, d) < 0 and (
        orientation(c, d, a) * orientation(c, d, b) < 0
    )


def validate_quad(
    points: Sequence[Sequence[float]], width: float, height: float
) -> np.ndarray:
    """Validate a boundary cycle and return its canonical TL,TR,BR,BL order."""
    quad = _points(points)
    try:
        canvas = np.asarray([width, height], dtype=float)
    except (TypeError, ValueError, OverflowError) as error:
        raise GeometryError("OUT_OF_BOUNDS") from error
    if not np.isfinite(canvas).all() or np.any(canvas <= 0) or np.any(quad < 0) or np.any(
        quad > canvas
    ):
        raise GeometryError("OUT_OF_BOUNDS")
    width, height = (float(value) for value in canvas)

    minimum_distance = max(4.0, 0.002 * math.hypot(width, height))
    distances = [
        float(np.linalg.norm(quad[i] - quad[j]))
        for i in range(4)
        for j in range(i + 1, 4)
    ]
    if min(distances) < minimum_distance:
        raise GeometryError("DUPLICATE_POINTS")

    if _segments_cross(quad[0], quad[1], quad[2], quad[3]) or _segments_cross(
        quad[1], quad[2], quad[3], quad[0]
    ):
        raise GeometryError("SELF_INTERSECTION")

    edges = np.roll(quad, -1, axis=0) - quad
    crosses = np.array([_cross(quad[i], quad[(i + 1) % 4], quad[(i + 2) % 4])
                        for i in range(4)])
    adjacent_products = np.array(
        [np.linalg.norm(edges[i]) * np.linalg.norm(edges[(i + 1) % 4]) for i in range(4)]
    )
    if np.any(np.abs(crosses) / adjacent_products < NEAR_COLLINEAR_SINE):
        raise GeometryError("NEAR_COLLINEAR")
    if not (np.all(crosses > 0) or np.all(crosses < 0)):
        raise GeometryError("NON_CONVEX")

    if abs(_signed_area(quad)) < max(256.0, 0.001 * width * height):
        raise GeometryError("AREA_TOO_SMALL")
    edge_lengths = np.linalg.norm(edges, axis=1)
    if float(edge_lengths.min() / edge_lengths.max()) < 0.02:
        raise GeometryError("TOO_SLENDER")
    return order_quad(quad)


def _normalization(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    center = points.mean(axis=0)
    rms = math.sqrt(float(np.mean(np.sum((points - center) ** 2, axis=1))))
    if rms <= np.finfo(float).eps:
        raise GeometryError("SINGULAR_HOMOGRAPHY")
    scale = math.sqrt(2.0) / rms
    transform = np.array(
        [[scale, 0.0, -scale * center[0]],
         [0.0, scale, -scale * center[1]],
         [0.0, 0.0, 1.0]]
    )
    homogeneous = np.column_stack([points, np.ones(4)])
    normalized = (transform @ homogeneous.T).T[:, :2]
    return normalized, transform


def compute_homography(
    source: Sequence[Sequence[float]], destination: Sequence[Sequence[float]]
) -> np.ndarray:
    """Compute a normalized-DLT source-to-destination homography."""
    src_points = _points(source, "SINGULAR_HOMOGRAPHY")
    dst_points = _points(destination, "SINGULAR_HOMOGRAPHY")
    src, src_transform = _normalization(src_points)
    dst, dst_transform = _normalization(dst_points)
    rows, values = [], []
    for (x, y), (u, v) in zip(src, dst):
        rows.extend([
            [x, y, 1.0, 0.0, 0.0, 0.0, -u * x, -u * y],
            [0.0, 0.0, 0.0, x, y, 1.0, -v * x, -v * y],
        ])
        values.extend([u, v])
    matrix = np.asarray(rows)
    if not np.isfinite(matrix).all() or np.linalg.cond(matrix, np.inf) > MAX_CONDITION:
        raise GeometryError("SINGULAR_HOMOGRAPHY")
    try:
        solution = np.linalg.solve(matrix, np.asarray(values))
    except np.linalg.LinAlgError as error:
        raise GeometryError("SINGULAR_HOMOGRAPHY") from error
    normalized_h = np.append(solution, 1.0).reshape(3, 3)
    homography = np.linalg.inv(dst_transform) @ normalized_h @ src_transform
    if abs(homography[2, 2]) <= np.finfo(float).eps:
        raise GeometryError("SINGULAR_HOMOGRAPHY")
    homography /= homography[2, 2]

    homogeneous = np.column_stack([src_points, np.ones(4)])
    projected = (homography @ homogeneous.T).T
    if np.any(np.abs(projected[:, 2]) <= np.finfo(float).eps):
        raise GeometryError("SINGULAR_HOMOGRAPHY")
    projected = projected[:, :2] / projected[:, 2, None]
    error = np.linalg.norm(projected - dst_points, axis=1).max()
    if not np.isfinite(error) or error > MAX_REPROJECTION_ERROR:
        raise GeometryError("SINGULAR_HOMOGRAPHY")
    return homography


def _line_intersection(
    a: np.ndarray, b: np.ndarray, c: np.ndarray, d: np.ndarray
) -> list[float] | None:
    line_one = np.cross([a[0], a[1], 1.0], [b[0], b[1], 1.0])
    line_two = np.cross([c[0], c[1], 1.0], [d[0], d[1], 1.0])
    point = np.cross(line_one, line_two)
    scale = max(1.0, abs(point[0]), abs(point[1]))
    if abs(point[2]) <= PARALLEL_EPSILON * scale:
        return None
    result = point[:2] / point[2]
    return [float(result[0]), float(result[1])]


def compute_vanishing_points(
    quad: Sequence[Sequence[float]],
) -> tuple[list[float] | None, list[float] | None]:
    """Return opposite-edge intersections; parallel edge families return ``None``."""
    points = _points(quad)
    return (
        _line_intersection(points[0], points[1], points[3], points[2]),
        _line_intersection(points[0], points[3], points[1], points[2]),
    )
