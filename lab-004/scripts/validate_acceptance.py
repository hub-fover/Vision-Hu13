"""Static acceptance checks for the local-only LAB 004 runtime boundary."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    contract = json.loads((ROOT / "shared/contracts.json").read_text(encoding="utf-8"))
    if contract.get("schemaVersion") != "lab004.measurement.v1":
        raise SystemExit("measurement schema changed")
    if contract["analysisMaxSide"] != 1280 or contract["maxWorkingSetMiB"] != 320:
        raise SystemExit("analysis or memory budget changed")
    sources = []
    for path in (ROOT / "web").rglob("*.js"):
        if "node_modules" in path.parts or "vendor" in path.parts or "tests" in path.parts or path.name == "playwright.config.js":
            continue
        sources.append(path.read_text(encoding="utf-8"))
    joined = "\n".join(sources)
    if re.search(r"(?:localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest)", joined):
        raise SystemExit("browser persistence or telemetry API found")
    if re.search(r"https?://", joined):
        raise SystemExit("remote runtime or upload URL found")
    for required in ("trackTemplateSequence", "trackFlowSequence", "dominantFrequency"):
        if required not in joined:
            raise SystemExit(f"missing runtime operation: {required}")
    for forbidden in ("solvePnPGeneric", "solvePnP", "Three.js", "three.module", "camera-pose"):
        if forbidden in joined:
            raise SystemExit(f"legacy pose runtime found: {forbidden}")
    print("LAB 004 acceptance: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
