"""Generate the deterministic motion sequence used by the LAB 004 sample."""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


def build_frames(count: int = 240, fps: float = 30.0) -> list[dict[str, float]]:
    return [
        {
            "timeS": i / fps,
            "offsetX": 3.0 * math.sin(2 * math.pi * 2.0 * i / fps),
            "offsetY": 0.8 * math.cos(2 * math.pi * 2.0 * i / fps),
            "score": 0.94,
        }
        for i in range(count)
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("lab-004/assets/samples/motion.json"))
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"fps": 30, "frames": build_frames()}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
