from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import exposure_fusion as fusion


def write_stack(directory: Path, exposure_stack) -> tuple[Path, Path, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, image in zip(("dark.png", "normal.png", "bright.png"), exposure_stack, strict=True):
        path = directory / name
        Image.fromarray(image).save(path)
        paths.append(path)
    return tuple(paths)


def test_end_to_end_fusion_returns_report_and_motion_mask(exposure_stack) -> None:
    result = fusion.fuse_exposures(exposure_stack)

    assert result.image.dtype == np.uint8
    assert result.image.shape[0] * result.image.shape[1] <= 4_000_000
    assert result.report.output_width == result.image.shape[1]
    assert result.report.estimated_working_set_mib <= 320
    assert result.motion_mask.shape == result.image.shape[:2]


def test_debug_directory_contains_teaching_evidence(tmp_path: Path, exposure_stack) -> None:
    result = fusion.fuse_exposures(exposure_stack, debug_dir=tmp_path)

    names = {path.name for path in tmp_path.iterdir()}
    assert result.image.size
    assert {"report.json", "motion-mask.png", "fusion.jpg", "weight-01.png", "aligned-02.jpg"} <= names


def test_cancellation_is_portable(exposure_stack) -> None:
    with pytest.raises(fusion.FusionError) as caught:
        fusion.fuse_exposures(exposure_stack, cancel_check=lambda: True)

    assert caught.value.code == "CANCELLED"


def test_working_set_budget_matches_four_megapixel_contract() -> None:
    assert 270 < fusion.estimate_working_set_mib(2000, 2000) < 320


def test_cli_writes_jpeg(tmp_path: Path, exposure_stack) -> None:
    sources = write_stack(tmp_path / "inputs", exposure_stack)
    output = tmp_path / "result.jpg"

    code = fusion.cli_main([*(str(path) for path in sources), "--output", str(output)])

    assert code == 0
    with Image.open(output) as opened:
        assert opened.format == "JPEG"


@pytest.mark.parametrize("code", fusion.ERROR_CODES)
def test_cli_has_an_exit_status_for_every_error(code: str) -> None:
    error = fusion.FusionError(code, "test")
    assert fusion.exit_code_for_error(error) == (130 if code == "CANCELLED" else 2)
