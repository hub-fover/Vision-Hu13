import json
from pathlib import Path

from camera_measurement.contracts import SCHEMA_VERSION


def test_public_contract_documents_only_static_scene_speed():
    root = Path(__file__).parents[2]
    contract = json.loads((root / "shared" / "contracts.json").read_text(encoding="utf-8"))
    docs = (root / "docs" / "CONTRACTS.md").read_text(encoding="utf-8")
    readme = (root / "README.md").read_text(encoding="utf-8")
    assert contract["schemaVersion"] == SCHEMA_VERSION == "lab004.static-scene-speed.v2"
    assert "m/s" in docs and "km/h" in docs
    assert "主频" not in readme
    assert "飞机" not in readme


def test_article_materials_are_local_only():
    text = (Path(__file__).parents[3] / ".gitignore").read_text(encoding="utf-8")
    assert "lab-004/article/" in text
