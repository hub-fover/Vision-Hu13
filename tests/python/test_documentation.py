from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_release_documentation_and_licenses_are_present() -> None:
    expected = (
        "README.md",
        "LICENSE",
        "LICENSE-CONTENT.md",
        "assets/SOURCES.md",
    )
    for relative_path in expected:
        assert (ROOT / relative_path).is_file(), relative_path


def test_readme_uses_release_urls_and_documents_boundaries() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "https://hub-fover.github.io/Vision-Hu13/" in readme
    assert "https://github.com/hub-fover/Vision-Hu13" in readme
    assert "不包含用户图片上传请求" in readme
    assert "曲面" in readme
    assert "遮挡" in readme


def test_asset_ledger_records_all_ten_examples() -> None:
    ledger = (ROOT / "assets" / "SOURCES.md").read_text(encoding="utf-8")
    for filename in (
        "court.jpg",
        "facade.jpg",
        "wall.jpg",
        "packaging.jpg",
        "screen.jpg",
        "court-ad.png",
        "facade-logo.png",
        "vision-hub-mark.png",
        "lab-poster.png",
        "screen-ui.png",
    ):
        assert filename in ledger
    assert "Pexels License" in ledger
    assert "Peter Dyllong" in ledger
    assert "Joaquin Carfagna" in ledger
    assert "Miks Bergmanis" in ledger
    assert "mockupbee" in ledger
    assert "Lisa Anna" in ledger
    assert "第三方背景不适用 CC BY 4.0" in ledger


def test_content_license_excludes_third_party_photo_backgrounds() -> None:
    notice = (ROOT / "LICENSE-CONTENT.md").read_text(encoding="utf-8")
    assert "`assets/examples/wall.jpg`" in notice
    assert "`assets/examples/court.jpg`" in notice
    assert "`assets/examples/facade.jpg`" in notice
    assert "`assets/examples/packaging.jpg`" in notice
    assert "`assets/examples/screen.jpg`" in notice
    assert "Pexels License" in notice
    assert "not covered by CC BY 4.0" in notice
