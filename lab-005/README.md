# LAB 005: Defocus depth

This is a local, five-frame focus-stack experiment. Capture the same scene five
times while changing focus, keep the camera still, and the pipeline produces a
relative depth map. Camera intrinsics and a three-distance focus scale can be
provided for a reference-level metric estimate.

```powershell
python -m defocus_depth estimate stack-folder --output depth.png
python -m defocus_depth calibrate-intrinsics calibration-folder --pattern 9x6 --square-size 0.025 --output camera.json
python -m defocus_depth calibrate-scale scale.json --distances 0.3 0.6 1.0 --output focus-depth.json
```

No image is uploaded or persisted by the reference implementation.
