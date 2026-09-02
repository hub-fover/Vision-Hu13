from __future__ import annotations

import json
from pathlib import Path

from panorama_stitch.contracts import ERROR_CODES, MatchMetrics, StitchOptions


ROOT = Path(__file__).resolve().parents[2]


def test_python_contracts_match_the_shared_defaults() -> None:
    shared = json.loads((ROOT / "shared" / "contracts.json").read_text(encoding="utf-8"))

    assert StitchOptions().to_shared_dict() == shared["defaults"]
    assert ERROR_CODES == tuple(shared["errorCodes"])


def test_match_metrics_captures_the_quality_gates_for_one_adjacent_pair() -> None:
    metrics = MatchMetrics(
        pair_index=1,
        candidate_count=48,
        ratio_match_count=31,
        mutual_match_count=27,
        inlier_count=24,
        inlier_ratio=0.89,
        median_reprojection_error_px=1.2,
    )

    assert metrics.pair_index == 1
    assert metrics.inlier_count == 24
    assert metrics.median_reprojection_error_px == 1.2
