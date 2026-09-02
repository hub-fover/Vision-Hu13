import itertools
import json
from pathlib import Path

import numpy as np
import pytest

from perspective_paste.geometry import (
    GeometryError,
    compute_homography,
    compute_perspective_guide,
    compute_vanishing_points,
    order_quad,
    validate_quad,
)


ROOT = Path(__file__).parents[2]
GEOMETRY_FIXTURES = json.loads(
    (ROOT / "shared/fixtures/geometry.json").read_text(encoding="utf-8")
)


def assert_code(code, call):
    with pytest.raises(GeometryError) as caught:
        call()
    assert caught.value.code == code


def project(matrix, point):
    result = matrix @ np.array([*point, 1.0])
    return result[:2] / result[2]


def fixture_number(value):
    if value == "NaN":
        return float("nan")
    if value == "Infinity":
        return float("inf")
    return value


def test_shared_contract_fixtures_load():
    errors = json.loads((ROOT / "shared/errors.json").read_text(encoding="utf-8"))
    presets = json.loads((ROOT / "shared/presets.json").read_text(encoding="utf-8"))
    assert set(errors) == {
        "OUT_OF_BOUNDS", "DUPLICATE_POINTS", "SELF_INTERSECTION", "NON_CONVEX",
        "NEAR_COLLINEAR", "AREA_TOO_SMALL", "TOO_SLENDER", "SINGULAR_HOMOGRAPHY",
    }
    assert presets["geometry"]["maximumNormalizedHomographyCondition"] == 100_000_000
    assert GEOMETRY_FIXTURES["ordering"]["name"] == "skewed-quadrilateral"
    assert len(GEOMETRY_FIXTURES["validationErrors"]) == 9
    assert len(GEOMETRY_FIXTURES["invalidHomographies"]) == 3


def test_order_quad_handles_every_random_order():
    case = GEOMETRY_FIXTURES["ordering"]
    expected = np.asarray(case["ordered"], dtype=float)
    for permutation in itertools.permutations(expected.tolist()):
        np.testing.assert_allclose(order_quad(permutation), expected)


@pytest.mark.parametrize(
    ("points", "size", "code"),
    [(case["points"], [fixture_number(value) for value in case["canvas"]], case["code"])
     for case in GEOMETRY_FIXTURES["validationErrors"]],
)
def test_validate_quad_error_codes(points, size, code):
    assert_code(code, lambda: validate_quad(points, *size))


def test_validate_quad_returns_tl_tr_br_bl():
    case = GEOMETRY_FIXTURES["ordering"]
    np.testing.assert_allclose(
        validate_quad(case["ordered"], *case["canvas"]), case["ordered"]
    )


@pytest.mark.parametrize(
    ("source", "destination", "expected"),
    [(case["source"], case["destination"], case["expected"])
     for case in GEOMETRY_FIXTURES["homographies"]],
)
def test_compute_homography_known_mappings(source, destination, expected):
    matrix = compute_homography(source, destination)
    np.testing.assert_allclose(matrix, expected, atol=1e-9)
    for src, dst in zip(source, destination):
        np.testing.assert_allclose(project(matrix, src), dst, atol=0.5)


def test_projective_fixture_has_nonzero_perspective_term():
    case = next(
        item for item in GEOMETRY_FIXTURES["homographies"]
        if item.get("requiresPerspective")
    )
    matrix = compute_homography(case["source"], case["destination"])
    assert abs(matrix[2, 0]) > 1e-12 or abs(matrix[2, 1]) > 1e-12


def test_compute_homography_rejects_singular_input():
    case = GEOMETRY_FIXTURES["singularHomography"]
    assert_code(case["code"], lambda: compute_homography(
        case["source"], case["destination"]
    ))


@pytest.mark.parametrize("case", GEOMETRY_FIXTURES["invalidHomographies"])
def test_compute_homography_wraps_malformed_inputs(case):
    assert_code(case["code"], lambda: compute_homography(
        case["source"], case["destination"]
    ))


@pytest.mark.parametrize("case", GEOMETRY_FIXTURES["vanishingPoints"])
def test_compute_vanishing_points_finite_and_parallel_cases(case):
    actual = compute_vanishing_points(case["quad"])
    for point, expected in zip(actual, case["expected"]):
        if expected is None:
            assert point is None
        else:
            np.testing.assert_allclose(point, expected, atol=1e-9)


@pytest.mark.parametrize("case", GEOMETRY_FIXTURES["perspectiveGuides"])
def test_compute_perspective_guide_shared_contract(case):
    guide = compute_perspective_guide(case["quad"], case["viewport"])
    assert len(guide["directions"]) == 2
    for actual, expected in zip(guide["directions"], case["directions"]):
        assert actual["family"] == expected["family"]
        assert actual["status"] == expected["status"]
        if "point" in expected:
            np.testing.assert_allclose(actual["point"], expected["point"], atol=1e-9)
        else:
            assert actual["point"] is None
        if "direction" in expected:
            np.testing.assert_allclose(
                actual["direction"], expected["direction"], atol=1e-9
            )
        if "edgeAnchor" in expected:
            np.testing.assert_allclose(
                actual["edge_anchor"], expected["edgeAnchor"], atol=1e-9
            )
        elif expected["status"] != "offscreen":
            assert actual["edge_anchor"] is None
        if "distanceDiagonals" in expected:
            assert actual["distance_diagonals"] == pytest.approx(
                expected["distanceDiagonals"], abs=1e-9
            )
        elif expected["status"] != "offscreen":
            assert actual["distance_diagonals"] is None

    expected_line = case["vanishingLine"]
    actual_line = guide["vanishing_line"]
    assert actual_line["status"] == expected_line["status"]
    np.testing.assert_allclose(
        actual_line["coefficients"], expected_line["coefficients"], atol=1e-9
    )
    if expected_line["segment"] is None:
        assert actual_line["segment"] is None
    else:
        np.testing.assert_allclose(
            actual_line["segment"], expected_line["segment"], atol=1e-9
        )
