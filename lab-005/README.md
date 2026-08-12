# LAB 005: Defocus depth

This is a local, five-frame focus-stack experiment. Capture the same scene five
times while changing focus, keep the camera still, and the pipeline produces a
relative depth map. Camera intrinsics and a three-distance focus scale can be
provided for a reference-level metric estimate.

```powershell
python -m defocus_depth estimate stack-folder --output depth.png
python -m defocus_depth calibrate-intrinsics calibration-folder --pattern 9x6 --square-size 0.025 --output camera.json
python -m defocus_depth calibrate-scale scale-folder --distances 0.3 0.6 1.0 --calibration camera.json --output focus-depth.json
```

No image is uploaded or persisted by the reference implementation.

## Browser runtime boundary

The browser ships the pinned OpenCV.js 4.12 distribution as a same-origin,
Worker-loaded asset. It exposes `calibrateCameraExtended` but not the high-level
chessboard detector, so LAB 005 uses a conservative local black-cell lattice
detector and rejects incomplete or ambiguous boards. Complex views that are
rejected can be calibrated with the Python `calibrate-intrinsics` command and
imported as `lab005.camera-intrinsics.v1` JSON. No fallback fabricates camera
parameters, and relative focus-depth estimation remains fully local.
