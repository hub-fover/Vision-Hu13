# LAB 004: Local Visual Displacement Measurement

LAB 004 uses an ordinary fixed camera to estimate small two-dimensional motion
from a target region. Select two points whose real separation is known, track a
textured target with template matching or Lucas--Kanade optical flow, and the
tool reports pixel displacement, reference millimetres, a displacement curve,
and (when enough frames exist) the dominant vibration frequency.

All processing is local. No image or video is uploaded and the package does not
use cookies, browser storage, telemetry, or a cloud runtime. Results are
reference-level estimates, not a replacement for a calibrated instrument,
laser range finder, or engineering displacement sensor. The camera must stay
fixed and the target should be approximately planar, rigid, and textured.

The cross-runtime contract is `shared/contracts.json`; it uses
`lab004.measurement.v1` and metres internally. The Python package is
`camera_measurement` and supports Python 3.11/3.12.

```powershell
python -m pip install -r requirements-lock.txt
python -m pytest
python -m camera_measurement analyze-frames frames \
  --target-roi roi.json --scale-points scale.json \
  --output report.json --debug-dir debug
```

`roi.json` contains `xPx`, `yPx`, `widthPx`, and `heightPx`. `scale.json`
contains `p1Px`, `p2Px`, `realDistance` and `unit` (`mm`, `cm`, or `m`).
The CLI also accepts `measure-video` for MP4/WebM and `track --camera 0` for
local camera capture. DIC is a Python-only teaching mode; the browser's main
flow uses template matching and optional optical flow.
