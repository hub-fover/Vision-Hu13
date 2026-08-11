# LAB 005: Defocus depth

This is a local, five-frame focus-stack experiment. Capture the same scene five
times while changing focus, keep the camera still, and the pipeline produces a
relative depth map. Camera intrinsics and a three-distance focus scale can be
provided for a reference-level metric estimate.

```powershell
python -m defocus_depth estimate stack-folder --output depth.png
python -m defocus_depth calibrate-intrinsics calibration-folder --pattern 9x6 --square-size 0.025 --output camera.json
python -m defocus_depth calibrate-scale scale-folder --distances 0.3 0.6 1.0 --output focus-depth.json
```

No image is uploaded or persisted by the reference implementation.

## Browser runtime boundary

The browser ships the pinned OpenCV.js 4.12 default distribution as a
same-origin Worker asset. That distribution does not include the `calib3d`
exports required for chessboard detection and camera calibration. The web
application therefore reports `RUNTIME_MISSING` for its optional enhanced
calibration mode instead of fabricating a result. Run
`calibrate-intrinsics` with the Python package, then import the resulting
`lab005.camera-intrinsics.v1` JSON in the page. Relative focus-depth estimation
and scale calibration remain fully local in the browser.
