"""OpenCV.js build_js.py adapter for the maintained LAB004 JSON whitelist."""

from __future__ import annotations

import json
from pathlib import Path


_data = json.loads((Path(__file__).with_name("opencv-whitelist.json")).read_text(encoding="utf-8"))
_modules = [
    {"": _data["symbolsByModule"][module]}
    for module in _data["modules"]
]

# build_js.py supplies makeWhiteList when this file is evaluated.
white_list = makeWhiteList(_modules)
