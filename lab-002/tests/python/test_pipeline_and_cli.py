from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys
import tomllib

import numpy as np
import panorama_stitch as panorama
import pytest
from PIL import Image


PUBLIC_APIS = {
    "extract_features",
    "match_pair",
    "estimate_homography",
    "compose_transforms",
    "warp_images",
    "blend_panorama",
    "auto_crop",
    "stitch_images",
}


def api(name: str):
    assert hasattr(panorama, name), f"missing public API: {name}"
    return getattr(panorama, name)


def overlapping_pair() -> tuple[np.ndarray, np.ndarray]:
    base = np.random.default_rng(2026).integers(
        0,
        256,
        size=(240, 480, 3),
        dtype=np.uint8,
    )
    return base[:, :300].copy(), base[:, 180:].copy()


def write_pair(directory: Path) -> tuple[Path, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    left, right = overlapping_pair()
    left_path = directory / "mountain-01.png"
    right_path = directory / "mountain-02.png"
    Image.fromarray(left).save(left_path)
    Image.fromarray(right).save(right_path)
    return left_path, right_path


def test_package_exports_every_required_teaching_api() -> None:
    missing = sorted(name for name in PUBLIC_APIS if not hasattr(panorama, name))

    assert missing == []


def test_stitch_images_runs_the_adjacent_pipeline_and_returns_metrics() -> None:
    stitch_images = api("stitch_images")
    left, right = overlapping_pair()

    result = stitch_images([left, right])

    assert result.image.shape[0] >= 220
    assert result.image.shape[1] >= 450
    assert len(result.match_metrics) == 1
    assert result.match_metrics[0].inlier_count >= 20
    assert result.match_metrics[0].median_reprojection_error_px <= 2.5
    assert result.crop.width == result.image.shape[1]
    assert result.crop.height == result.image.shape[0]


def test_stitch_images_rejects_fewer_than_two_inputs() -> None:
    stitch_images = api("stitch_images")

    with pytest.raises(Exception) as caught:
        stitch_images([np.zeros((20, 20, 3), dtype=np.uint8)])

    assert caught.value.code == "NOT_ENOUGH_IMAGES"


def test_stitch_images_can_be_cancelled_between_pipeline_stages() -> None:
    stitch_images = api("stitch_images")
    left, right = overlapping_pair()

    with pytest.raises(Exception) as caught:
        stitch_images([left, right], cancel_check=lambda: True)

    assert caught.value.code == "CANCELLED"


def test_stitch_images_names_the_low_texture_input_and_adjacent_pair(
    tmp_path: Path,
) -> None:
    stitch_images = api("stitch_images")
    left, _ = write_pair(tmp_path)
    blank = tmp_path / "blank.png"
    Image.new("RGB", (240, 300), "gray").save(blank)

    with pytest.raises(Exception) as caught:
        stitch_images([left, blank])

    assert caught.value.code == "LOW_TEXTURE"
    assert "mountain-01.png -> blank.png" in str(caught.value)
    assert "pair 1" in str(caught.value)


def test_input_warnings_follow_the_shared_count_and_megapixel_thresholds() -> None:
    input_warnings = api("input_warnings")
    many = [np.zeros((10, 10, 3), dtype=np.uint8) for _ in range(7)]
    large_shapes = [(5000, 5000), (5000, 5000), (5000, 5000)]

    assert input_warnings(many) == (
        "7 images exceeds the 6-image teaching recommendation.",
    )
    assert input_warnings(image_shapes=large_shapes) == (
        "75.0 source megapixels exceeds the 60MP teaching recommendation.",
    )


def test_debug_directory_contains_each_required_real_input_diagnostic(
    tmp_path: Path,
) -> None:
    stitch_images = api("stitch_images")
    left_path, right_path = write_pair(tmp_path / "inputs")
    debug_dir = tmp_path / "debug"

    result = stitch_images([left_path, right_path], debug_dir=debug_dir)

    assert result.image.size > 0
    assert sorted(path.name for path in debug_dir.iterdir()) == [
        "exposure.json",
        "features-01.jpg",
        "features-02.jpg",
        "inliers-01-02.jpg",
        "matches-01-02.jpg",
        "seam.png",
        "transforms.json",
    ]
    assert all(path.stat().st_size > 0 for path in debug_dir.iterdir())


def test_default_sample_contract_discovers_supported_mountain_frames_in_order(
    tmp_path: Path,
) -> None:
    discover_default_samples = api("discover_default_samples")
    sample_dir = tmp_path / "assets" / "samples" / "mountains"
    sample_dir.mkdir(parents=True)
    for name in ("mountain-03.webp", "mountain-01.jpg", "mountain-02.png"):
        Image.new("RGB", (4, 4), "green").save(sample_dir / name)
    Image.new("RGB", (4, 4), "green").save(sample_dir / "ignore.bmp")

    discovered = discover_default_samples(sample_dir)

    assert panorama.DEFAULT_SAMPLE_RELATIVE_DIRECTORY.as_posix() == (
        "samples/mountains"
    )
    assert [path.name for path in discovered] == [
        "mountain-01.jpg",
        "mountain-02.png",
        "mountain-03.webp",
    ]


def test_default_sample_contract_fails_actionably_until_real_media_is_present(
    tmp_path: Path,
) -> None:
    discover_default_samples = api("discover_default_samples")
    sample_dir = tmp_path / "assets" / "samples" / "mountains"

    with pytest.raises(Exception) as caught:
        discover_default_samples(sample_dir)

    assert caught.value.code == "NOT_ENOUGH_IMAGES"
    assert "mountain sample" in str(caught.value).lower()


def test_default_sample_directory_is_an_importlib_package_resource() -> None:
    default_sample_directory = api("default_sample_directory")

    sample_dir = default_sample_directory()

    assert sample_dir.is_dir()
    assert sample_dir.name == "mountains"
    assert sample_dir.parent.name == "samples"
    assert sample_dir.parent.parent.name == "panorama_stitch"


def test_package_metadata_includes_the_mountain_resource_directory() -> None:
    project_root = Path(__file__).resolve().parents[2]
    with (project_root / "pyproject.toml").open("rb") as config_file:
        config = tomllib.load(config_file)

    package_data = config["tool"]["setuptools"]["package-data"]["panorama_stitch"]

    assert "samples/mountains/*" in package_data


def test_sample_resource_resolves_from_an_isolated_installed_package(
    tmp_path: Path,
) -> None:
    project_root = Path(__file__).resolve().parents[2]
    site_packages = tmp_path / "site-packages"
    installed_package = site_packages / "panorama_stitch"
    shutil.copytree(
        project_root / "python" / "panorama_stitch",
        installed_package,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )
    script = (
        "import sys;"
        f"sys.path.insert(0, {str(site_packages)!r});"
        "from panorama_stitch import default_sample_directory;"
        "sample_dir=default_sample_directory();"
        "assert sample_dir.is_dir();"
        "assert sample_dir.name == 'mountains'"
    )

    completed = subprocess.run(
        [sys.executable, "-I", "-c", script],
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr


def test_cli_no_arguments_uses_the_packaged_sample_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cli_main = api("cli_main")
    sample_dir = tmp_path / "assets" / "samples" / "mountains"
    write_pair(sample_dir)
    monkeypatch.chdir(tmp_path)

    exit_code = cli_main([], default_sample_dir=sample_dir)

    assert exit_code == 0
    with Image.open(tmp_path / "panorama.jpg") as output:
        assert output.format == "JPEG"
        assert output.width >= 450


def test_cli_reports_portable_errors_with_a_nonzero_exit(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cli_main = api("cli_main")
    source = tmp_path / "only.png"
    Image.new("RGB", (20, 20), "gray").save(source)

    exit_code = cli_main([str(source)])

    assert exit_code == 2
    assert "[NOT_ENOUGH_IMAGES]" in capsys.readouterr().err


@pytest.mark.parametrize("code", panorama.ERROR_CODES)
def test_cli_has_a_defined_exit_status_for_every_shared_error_code(code: str) -> None:
    exit_code_for_error = api("exit_code_for_error")
    error = panorama.StitchError(code, "test")

    assert exit_code_for_error(error) == (130 if code == "CANCELLED" else 2)


def test_python_module_exposes_cli_help() -> None:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(
        Path(__file__).resolve().parents[2] / "python"
    )

    completed = subprocess.run(
        [sys.executable, "-m", "panorama_stitch", "--help"],
        capture_output=True,
        text=True,
        env=environment,
        check=False,
    )

    assert completed.returncode == 0
    assert "--quality {mobile,hd}" in completed.stdout
    assert "--debug-dir" in completed.stdout
