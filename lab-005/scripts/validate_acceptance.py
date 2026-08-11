"""Static, deterministic release checks for the LAB 005 local application."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOJIBAKE = ("锛�", "绔�", "鍙�", "鏃�", "闂�", "鈥�", "CC0", "Wikimedia Commons")
REQUIRED_WEB = ("index.html", "styles.css", "js/app.js", "js/state.js", "js/worker-client.js", "js/defocus.worker.js")


def main() -> None:
    errors: list[str] = []
    contract_path = ROOT / "shared" / "contracts.json"
    try:
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"invalid contract: {exc}") from exc
    if contract.get("defaults", {}).get("inputCount") != 5:
        errors.append("contract inputCount must be 5")
    if "FOCUS_SPREAD_TOO_SMALL" not in contract.get("errorCodes", []):
        errors.append("contract is missing FOCUS_SPREAD_TOO_SMALL")

    web = ROOT / "web"
    for relative in REQUIRED_WEB:
        if not (web / relative).is_file():
            errors.append(f"missing web runtime file: {relative}")
    manifest_path = web / "assets" / "samples" / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"invalid sample manifest: {exc}")
        manifest = {}
    frames = manifest.get("frames", [])
    if manifest.get("schema") != "lab005.samples.v1" or len(frames) != 5:
        errors.append("sample manifest must contain five lab005.samples.v1 frames")
    for frame in frames:
        if not (web / "assets" / "samples" / str(frame.get("path", ""))).is_file():
            errors.append(f"missing sample frame: {frame.get('path')}")

    for path in web.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".html", ".css", ".js", ".json"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append(f"non-UTF-8 web file: {path.relative_to(ROOT)}")
            continue
        for marker in MOJIBAKE:
            if marker in text:
                errors.append(f"legacy/garbled text {marker!r} in {path.relative_to(ROOT)}")
        if path.suffix.lower() in {".html", ".js"}:
            if "https://" in text or "http://" in text:
                errors.append(f"remote runtime reference in {path.relative_to(ROOT)}")
            if any(token in text for token in ("XMLHttpRequest", "sendBeacon")) or "fetch('http" in text or 'fetch("http' in text:
                errors.append(f"upload/network API in {path.relative_to(ROOT)}")
            if any(token in text for token in ("localStorage", "sessionStorage", "indexedDB", "document.cookie")):
                errors.append(f"persistent storage in {path.relative_to(ROOT)}")

    cross_runtime = ROOT / "scripts" / "cross_runtime_web.mjs"
    if cross_runtime.is_file():
        try:
            subprocess.run(["node", str(cross_runtime)], check=True, capture_output=True, text=True)
        except (OSError, subprocess.CalledProcessError) as exc:
            errors.append(f"cross-runtime check failed: {exc}")

    if errors:
        raise SystemExit("\n".join(f"- {error}" for error in errors))
    print("LAB 005 acceptance: PASS")


if __name__ == "__main__":
    main()
