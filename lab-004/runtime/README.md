# LAB004 OpenCV.js runtime

This directory contains the reproducible OpenCV.js build contract, not a
generated runtime. The source is OpenCV 4.12.0 at commit
`49486f61fb25722cbcf586b7f4320921d46fb38e`; the build image is
`emscripten/emsdk:4.0.10@sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7`.

`opencv-whitelist.json` is the maintained symbol/module list. The adjacent
`opencv_js.config.py` adapts it to OpenCV's `build_js.py` whitelist format.
Only `core`, `imgproc`, `video`, and `calib3d` are enabled. Emscripten uses a
fixed 128 MiB initial / 256 MiB maximum memory (`ALLOW_MEMORY_GROWTH=0`) so a
Worker has predictable bounds. The deterministic gzip target is 8 MiB.

On Windows, validate the contract without Docker:

```powershell
python lab-004/scripts/build_opencv.py --dry-run
```

CI performs the real build with a checkout of the pinned OpenCV commit:

```powershell
python lab-004/scripts/build_opencv.py --source-dir C:\src\opencv
```

The generated `lab-004/web/vendor/opencv.js` and manifest are ignored by git.
The future Worker should load `./vendor/opencv.js` same-origin; no CDN or
remote runtime is permitted.

OpenCV 4.12.0 still emits the removed Emscripten `DEMANGLE_SUPPORT` linker
setting. Before compiling, the builder applies the minimal one-line change
from upstream `opencv/opencv#27514`; the pinned source commit remains the
verified checkout and the compatibility patch is stored beside this contract.
