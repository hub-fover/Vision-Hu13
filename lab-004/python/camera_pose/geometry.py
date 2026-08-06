"""Independent LAB 004 plane and projective geometry."""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray

from .contracts import PlaneTarget
from .errors import CameraPoseError


def validate_quad(
    points: Sequence[Sequence[float]], width: float, height: float
) -> NDArray[np.float64]:
    try:
        image_size = np.asarray([width, height], dtype=np.float64)
    except (TypeError, ValueError, OverflowError) as error:
        raise CameraPoseError("INVALID_DIMENSIONS") from error
    if not np.isfinite(image_size).all() or np.any(image_size <= 0):
        raise CameraPoseError("INVALID_DIMENSIONS")

    quad = _four_points(points)
    width_f, height_f = (float(value) for value in image_size)
    if (
        np.any(quad[:, 0] <= 0)
        or np.any(quad[:, 0] >= width_f)
        or np.any(quad[:, 1] <= 0)
        or np.any(quad[:, 1] >= height_f)
    ):
        raise CameraPoseError("TARGET_CLIPPED")

    minimum_distance = max(4.0, 0.002 * math.hypot(width_f, height_f))
    distances = [
        float(np.linalg.norm(quad[first] - quad[second]))
        for first in range(4)
        for second in range(first + 1, 4)
    ]
    if min(distances) < minimum_distance:
        raise CameraPoseError("INVALID_QUAD")
    if _segments_cross(quad[0], quad[1], quad[2], quad[3]) or _segments_cross(
        quad[1], quad[2], quad[3], quad[0]
    ):
        raise CameraPoseError("INVALID_QUAD")

    edges = np.roll(quad, -1, axis=0) - quad
    crosses = np.asarray(
        [_cross(quad[index], quad[(index + 1) % 4], quad[(index + 2) % 4])
         for index in range(4)]
    )
    products = np.asarray(
        [np.linalg.norm(edges[index]) * np.linalg.norm(edges[(index + 1) % 4])
         for index in range(4)]
    )
    if np.any(products <= np.finfo(float).eps) or np.any(
        np.abs(crosses) / products < 1e-3
    ):
        raise CameraPoseError("INVALID_QUAD")
    if not np.all(crosses > 0):
        raise CameraPoseError("INVALID_QUAD")
    if not np.allclose(quad, _canonical_order(quad), rtol=0.0, atol=1e-9):
        raise CameraPoseError("INVALID_QUAD")
    if _signed_area(quad) < max(256.0, 0.001 * width_f * height_f):
        raise CameraPoseError("TARGET_TOO_SMALL")
    edge_lengths = np.linalg.norm(edges, axis=1)
    if float(edge_lengths.min() / edge_lengths.max()) < 0.02:
        raise CameraPoseError("INVALID_QUAD")
    return quad.copy()


def plane_object_points(target: PlaneTarget) -> NDArray[np.float64]:
    dimensions = np.asarray([target.width_m, target.height_m], dtype=np.float64)
    if not np.isfinite(dimensions).all() or np.any(dimensions <= 0):
        raise CameraPoseError("INVALID_DIMENSIONS")
    half_width, half_height = dimensions / 2.0
    return np.asarray(
        [
            [-half_width, +half_height, 0.0],
            [+half_width, +half_height, 0.0],
            [+half_width, -half_height, 0.0],
            [-half_width, -half_height, 0.0],
        ],
        dtype=np.float64,
    )


def compute_normalized_homography(
    source: Sequence[Sequence[float]], destination: Sequence[Sequence[float]]
) -> NDArray[np.float64]:
    source_points = _four_points(source)
    destination_points = _four_points(destination)
    normalized_source, source_transform = _normalize_points(source_points)
    normalized_destination, destination_transform = _normalize_points(destination_points)
    rows: list[list[float]] = []
    for (x, y), (u, v) in zip(normalized_source, normalized_destination):
        rows.extend(
            [
                [-x, -y, -1.0, 0.0, 0.0, 0.0, u * x, u * y, u],
                [0.0, 0.0, 0.0, -x, -y, -1.0, v * x, v * y, v],
            ]
        )
    design = np.asarray(rows, dtype=np.float64)
    try:
        _, singular_values, vectors = np.linalg.svd(design)
    except np.linalg.LinAlgError as error:
        raise CameraPoseError("INVALID_QUAD") from error
    if (
        not np.isfinite(singular_values).all()
        or singular_values[-1] <= np.finfo(float).eps
        or singular_values[0] / singular_values[-1] > 1e8
    ):
        raise CameraPoseError("INVALID_QUAD")
    normalized = vectors[-1].reshape(3, 3)
    matrix = np.linalg.inv(destination_transform) @ normalized @ source_transform
    if not np.isfinite(matrix).all() or abs(float(matrix[2, 2])) <= 1e-12:
        raise CameraPoseError("INVALID_QUAD")
    matrix /= matrix[2, 2]
    reprojection_error = np.linalg.norm(
        apply_homography(matrix, source_points) - destination_points,
        axis=1,
    ).max()
    if not np.isfinite(reprojection_error) or reprojection_error > 0.5:
        raise CameraPoseError("INVALID_QUAD")
    return matrix


def apply_homography(
    matrix: Sequence[Sequence[float]], points: Sequence[Sequence[float]]
) -> NDArray[np.float64]:
    transform = np.asarray(matrix, dtype=np.float64)
    values = np.asarray(points, dtype=np.float64)
    if (
        transform.shape != (3, 3)
        or values.ndim != 2
        or values.shape[1] != 2
        or not np.isfinite(transform).all()
        or not np.isfinite(values).all()
    ):
        raise CameraPoseError("INVALID_QUAD")
    projected = (transform @ np.column_stack([values, np.ones(len(values))]).T).T
    if np.any(np.abs(projected[:, 2]) <= 1e-12):
        raise CameraPoseError("INVALID_QUAD")
    return projected[:, :2] / projected[:, 2, None]


def _four_points(value: Sequence[Sequence[float]]) -> NDArray[np.float64]:
    try:
        points = np.asarray(value, dtype=np.float64)
    except (TypeError, ValueError, OverflowError) as error:
        raise CameraPoseError("INVALID_QUAD") from error
    if points.shape != (4, 2) or not np.isfinite(points).all():
        raise CameraPoseError("INVALID_QUAD")
    return points


def _signed_area(points: NDArray[np.float64]) -> float:
    return 0.5 * float(
        np.dot(points[:, 0], np.roll(points[:, 1], -1))
        - np.dot(points[:, 1], np.roll(points[:, 0], -1))
    )


def _canonical_order(points: NDArray[np.float64]) -> NDArray[np.float64]:
    center = points.mean(axis=0)
    angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
    result = points[np.argsort(angles)]
    if _signed_area(result) < 0:
        result = result[::-1]
    start = int(np.argmin(result[:, 0] + result[:, 1]))
    return np.roll(result, -start, axis=0)


def _cross(
    first: NDArray[np.float64], second: NDArray[np.float64], third: NDArray[np.float64]
) -> float:
    one = second - first
    two = third - second
    return float(one[0] * two[1] - one[1] * two[0])


def _segments_cross(
    a: NDArray[np.float64],
    b: NDArray[np.float64],
    c: NDArray[np.float64],
    d: NDArray[np.float64],
) -> bool:
    def orientation(
        first: NDArray[np.float64],
        second: NDArray[np.float64],
        third: NDArray[np.float64],
    ) -> float:
        one = second - first
        two = third - first
        return float(one[0] * two[1] - one[1] * two[0])

    return orientation(a, b, c) * orientation(a, b, d) < 0 and (
        orientation(c, d, a) * orientation(c, d, b) < 0
    )


def _normalize_points(
    points: NDArray[np.float64],
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    center = points.mean(axis=0)
    rms = math.sqrt(float(np.mean(np.sum((points - center) ** 2, axis=1))))
    if rms <= np.finfo(float).eps:
        raise CameraPoseError("INVALID_QUAD")
    scale = math.sqrt(2.0) / rms
    transform = np.asarray(
        [
            [scale, 0.0, -scale * center[0]],
            [0.0, scale, -scale * center[1]],
            [0.0, 0.0, 1.0],
        ]
    )
    homogeneous = np.column_stack([points, np.ones(4)])
    return (transform @ homogeneous.T).T[:, :2], transform
