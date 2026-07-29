import numpy as np

from perspective_paste.interaction import InteractionState


def test_state_adds_at_most_four_points_and_tracks_valid_quad():
    state = InteractionState(200, 160)
    for point in [(20, 20), (180, 20), (180, 140), (20, 140)]:
        assert state.add_point(point)

    assert not state.add_point((100, 100))
    np.testing.assert_allclose(
        state.last_valid_quad,
        [[20, 20], [180, 20], [180, 140], [20, 140]],
    )
    assert state.error_message is None


def test_select_and_drag_use_sixteen_pixel_hit_radius():
    state = InteractionState(200, 160, points=[(20, 20), (180, 20)])

    assert state.select_nearest((35, 20)) == 0
    assert state.drag_selected((30, 31))
    assert state.points[0] == (30.0, 31.0)
    assert state.select_nearest((47, 31)) is None
    assert state.selected_index is None


def test_invalid_drag_keeps_last_valid_quad_and_sets_concrete_message():
    state = InteractionState(
        200,
        160,
        points=[(20, 20), (180, 20), (180, 140), (20, 140)],
    )
    valid = state.last_valid_quad.copy()

    state.select_nearest((180, 20))
    state.drag_selected((20, 20))

    np.testing.assert_array_equal(state.last_valid_quad, valid)
    assert state.error_code == "DUPLICATE_POINTS"
    assert state.error_message == (
        "Points must be separated by the minimum point distance."
    )


def test_remove_nearest_and_reset_clear_interaction_state():
    state = InteractionState(
        200,
        160,
        points=[(20, 20), (180, 20), (180, 140), (20, 140)],
    )
    assert state.remove_nearest((171, 20))
    assert len(state.points) == 3
    assert state.last_valid_quad is None
    assert not state.remove_nearest((100, 100))

    state.reset()

    assert state.points == []
    assert state.selected_index is None
    assert state.last_valid_quad is None
    assert state.error_message is None


def test_initial_four_clicks_are_canonicalized_before_validation():
    state = InteractionState(200, 200)
    for point in [(190, 190), (10, 10), (10, 190), (190, 10)]:
        assert state.add_point(point)

    assert state.error_code is None
    np.testing.assert_allclose(
        state.last_valid_quad,
        [(10, 10), (190, 10), (190, 190), (10, 190)],
    )
    assert state.points == [
        (10.0, 10.0), (190.0, 10.0), (190.0, 190.0), (10.0, 190.0),
    ]
