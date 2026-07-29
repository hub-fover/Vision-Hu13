from __future__ import annotations

import numpy as np
import panorama_stitch as panorama
import pytest


def api(name: str):
    assert hasattr(panorama, name), f"missing public API: {name}"
    return getattr(panorama, name)


def feature_set(points: np.ndarray, descriptors: np.ndarray):
    feature_type = api("FeatureSet")
    return feature_type(
        points=np.asarray(points, dtype=np.float32),
        descriptors=np.asarray(descriptors, dtype=np.uint8),
        analysis_image=np.zeros((120, 160, 3), dtype=np.uint8),
        analysis_scale=1.0,
        image_shape=(120, 160),
    )


def unique_descriptors(count: int) -> np.ndarray:
    return np.random.default_rng(1729).integers(
        0,
        256,
        size=(count, 32),
        dtype=np.uint8,
    )


def grid_points(columns: int = 5, rows: int = 5) -> np.ndarray:
    return np.asarray(
        [(20 + x * 25, 15 + y * 20) for y in range(rows) for x in range(columns)],
        dtype=np.float32,
    )


def test_extract_features_uses_orb_at_the_capped_analysis_scale() -> None:
    extract_features = api("extract_features")
    image = np.random.default_rng(3).integers(
        0,
        256,
        size=(700, 1400, 3),
        dtype=np.uint8,
    )

    features = extract_features(image)

    assert max(features.analysis_image.shape[:2]) == 1280
    assert features.analysis_scale == pytest.approx(1280 / 1400)
    assert 20 <= len(features.points) <= panorama.StitchOptions().max_features
    assert features.descriptors.shape == (len(features.points), 32)
    assert features.points[:, 0].max() <= image.shape[1]
    assert features.points[:, 1].max() <= image.shape[0]


def test_extract_features_rejects_a_low_texture_image() -> None:
    extract_features = api("extract_features")

    with pytest.raises(Exception) as caught:
        extract_features(np.full((180, 240, 3), 127, dtype=np.uint8))

    assert caught.value.code == "LOW_TEXTURE"
    assert "texture" in str(caught.value).lower()


def test_match_pair_applies_ratio_and_mutual_consistency() -> None:
    match_pair = api("match_pair")
    descriptors = unique_descriptors(25)
    points = grid_points()

    result = match_pair(
        feature_set(points, descriptors),
        feature_set(points + (7, 3), descriptors.copy()),
        pair_index=0,
        pair_names=("left.jpg", "right.jpg"),
    )

    assert result.candidate_count == 25
    assert result.ratio_match_count == 25
    assert result.mutual_match_count == 25
    assert np.array_equal(result.left_indices, np.arange(25))
    assert np.array_equal(result.right_indices, np.arange(25))


def test_match_pair_reports_ambiguous_many_to_one_matches() -> None:
    match_pair = api("match_pair")
    points = grid_points()
    left_descriptors = np.zeros((25, 32), dtype=np.uint8)
    right_descriptors = np.full((25, 32), 255, dtype=np.uint8)
    right_descriptors[0] = 0

    with pytest.raises(Exception) as caught:
        match_pair(
            feature_set(points, left_descriptors),
            feature_set(points, right_descriptors),
            pair_index=1,
            pair_names=("middle.jpg", "right.jpg"),
        )

    assert caught.value.code == "AMBIGUOUS_MATCHES"
    assert "pair 2" in str(caught.value)
    assert "middle.jpg -> right.jpg" in str(caught.value)


def test_match_pair_reports_insufficient_overlap_before_geometry() -> None:
    match_pair = api("match_pair")
    points = grid_points()
    left = unique_descriptors(25)
    right = np.random.default_rng(99).integers(0, 256, (25, 32), dtype=np.uint8)

    with pytest.raises(Exception) as caught:
        match_pair(feature_set(points, left), feature_set(points, right))

    assert caught.value.code == "INSUFFICIENT_OVERLAP"


def test_estimate_homography_returns_metrics_for_a_valid_translation() -> None:
    match_pair = api("match_pair")
    estimate_homography = api("estimate_homography")
    points = grid_points()
    descriptors = unique_descriptors(25)
    left = feature_set(points, descriptors)
    right = feature_set(points + (13, -4), descriptors.copy())
    matches = match_pair(left, right)

    result = estimate_homography(left, right, matches)

    projected = result.transform @ np.array([45.0, 55.0, 1.0])
    projected /= projected[2]
    assert projected[:2] == pytest.approx((58.0, 51.0), abs=0.05)
    assert result.metrics.inlier_count == 25
    assert result.metrics.inlier_ratio == pytest.approx(1.0)
    assert result.metrics.median_reprojection_error_px < 0.05


def test_estimate_homography_rejects_a_low_inlier_ratio() -> None:
    match_pair = api("match_pair")
    estimate_homography = api("estimate_homography")
    descriptors = unique_descriptors(40)
    left_points = grid_points(columns=8, rows=5)
    right_points = left_points + (10, 2)
    right_points[20:] = np.random.default_rng(7).uniform(
        (0, 0),
        (150, 110),
        size=(20, 2),
    )
    left = feature_set(left_points, descriptors)
    right = feature_set(right_points, descriptors.copy())
    matches = match_pair(
        left,
        right,
        options=panorama.StitchOptions(min_inliers=10, min_inlier_ratio=0.75),
    )

    with pytest.raises(Exception) as caught:
        estimate_homography(
            left,
            right,
            matches,
            options=panorama.StitchOptions(min_inliers=10, min_inlier_ratio=0.75),
        )

    assert caught.value.code == "INSUFFICIENT_OVERLAP"
    assert "inlier" in str(caught.value).lower()


def test_estimate_homography_rejects_high_median_reprojection_error() -> None:
    match_pair = api("match_pair")
    estimate_homography = api("estimate_homography")
    points = grid_points()
    descriptors = unique_descriptors(25)
    noise = np.random.default_rng(11).normal(0, 0.8, points.shape)
    left = feature_set(points, descriptors)
    right = feature_set(points + (8, 2) + noise, descriptors.copy())
    options = panorama.StitchOptions(
        ransac_threshold_px=10,
        max_median_error_px=0.1,
    )
    matches = match_pair(left, right, options=options)

    with pytest.raises(Exception) as caught:
        estimate_homography(left, right, matches, options=options)

    assert caught.value.code == "HIGH_REPROJECTION_ERROR"


def test_estimate_homography_rejects_degenerate_collinear_points() -> None:
    match_pair = api("match_pair")
    estimate_homography = api("estimate_homography")
    x = np.linspace(5, 150, 25, dtype=np.float32)
    points = np.column_stack((x, 0.5 * x + 2))
    descriptors = unique_descriptors(25)
    left = feature_set(points, descriptors)
    right = feature_set(points + (5, 1), descriptors.copy())

    with pytest.raises(Exception) as caught:
        estimate_homography(left, right, match_pair(left, right))

    assert caught.value.code == "HOMOGRAPHY_UNSTABLE"


def test_estimate_homography_rejects_an_ill_conditioned_matrix() -> None:
    match_pair = api("match_pair")
    estimate_homography = api("estimate_homography")
    points = grid_points()
    descriptors = unique_descriptors(25)
    left = feature_set(points, descriptors)
    unstable = np.asarray(
        [[1e8, 0, 0], [0, 1, 0], [1e6, 0, 1]],
        dtype=np.float64,
    )
    homogeneous = np.column_stack((points, np.ones(len(points)))) @ unstable.T
    right_points = homogeneous[:, :2] / homogeneous[:, 2:]
    right = feature_set(right_points, descriptors.copy())

    with pytest.raises(Exception) as caught:
        estimate_homography(left, right, match_pair(left, right))

    assert caught.value.code == "HOMOGRAPHY_UNSTABLE"
    assert "condition" in str(caught.value).lower()


def test_estimate_homography_rejects_implausible_transformed_bounds() -> None:
    match_pair = api("match_pair")
    estimate_homography = api("estimate_homography")
    points = grid_points()
    descriptors = unique_descriptors(25)
    left = feature_set(points, descriptors)
    right = feature_set(points * 100, descriptors.copy())

    with pytest.raises(Exception) as caught:
        estimate_homography(left, right, match_pair(left, right))

    assert caught.value.code == "HOMOGRAPHY_UNSTABLE"
    assert "bounds" in str(caught.value).lower()
