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
fixed and the target should be approximately planar, rigid, and textured. For
moving-camera footage such as the airplane example, `camera-speed` tracks a
stationary ground patch and differentiates its apparent motion using a known
ground distance. That path is explicitly `reference-only`: perspective,
altitude, attitude, lens distortion, and rolling shutter mean it is not a
calibrated aircraft ground-speed measurement.

The cross-runtime contract is `shared/contracts.json`; it uses
`lab004.measurement.v1` and metres internally. The Python package is
`camera_measurement` and supports Python 3.11/3.12.

```powershell
# From the repository root:
python -m pip install -e lab-004

# Or from this lab-004 directory:
python -m pip install -r requirements-lock.txt
python -m pip install -e .
python -m pytest
python -m camera_measurement analyze-frames frames \
  --target-roi roi.json --scale-points scale.json \
  --output report.json --debug-dir debug

# Reference speed from a static ground object in moving-camera footage:
python -m camera_measurement measure-video flight.webm \
  --target-roi ground-roi.json --scale-points ground-scale.json \
  --method camera-speed --output speed-report.json
```

`roi.json` contains `xPx`, `yPx`, `widthPx`, and `heightPx`. `scale.json`
contains `p1Px`, `p2Px`, `realDistance` and `unit` (`mm`, `cm`, or `m`).
The CLI also accepts `measure-video` for MP4/WebM and `track --camera 0` for
local camera capture. DIC and Lucas--Kanade flow are Python teaching modes;
the browser's public flow uses template matching so the same rule is visible
in the sample, imported media, and live camera paths. The result report keeps
`dx/dy`, combined displacement, a millimetre reference, time-series samples,
and a dominant frequency when the sampling conditions support it. In
`camera-speed` reports, `velocity.meanSpeedMps`, `velocity.peakSpeedMps`, and
per-frame signed components are included; `spectrum` is intentionally omitted.

The browser has two measurement paths: fixed-camera template matching for a
moving target, and `camera-speed` for a moving phone pointed at a static scene.
The latter tracks many scene features with local Lucas--Kanade search, filters
forward/backward error, and fits a deterministic RANSAC affine model before
converting the ROI-centre motion to reference velocity. It reports inlier ratio
and median reprojection error alongside the result video.

The browser sample picker also includes three generated teaching scenes:
car-like lateral motion, bridge-like vertical vibration, and a two-dimensional
aircraft trajectory. Their parameters are recorded in
`assets/samples/manifest.json`; they are deterministic visual examples, not
real recordings or measurement-grade evidence. Real videos remain supported
through the local video import and camera paths.

The public sample assets also include a real VP8 WebM flight clip and GIF
preview from Wikimedia Commons (CC BY-SA 3.0, Subhashish Panigrahi). The
browser test imports that clip through the actual tracker. Fixed-camera mode
records `CAMERA_MOVED`; the separate aircraft workflow allows that motion and
reports only a reference-level velocity when the user supplies a known ground
scale.
