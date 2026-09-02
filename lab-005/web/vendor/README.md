# OpenCV.js runtime

Run `npm run vendor:opencv` after installing web dependencies. The generated
`opencv.js` is same-origin and ignored by Git.

The pinned `@techstark/opencv-js@4.12.0-release.1` package is the default
OpenCV.js distribution. It provides the core/image-processing APIs used by the
page, but does not export the checkerboard/calibration `calib3d` entry points
(`findChessboardCorners` and `calibrateCamera`). Its `undistort` API remains
available for applying a Python-generated calibration. The generated manifest records that fact:
browser checkerboard calibration returns `RUNTIME_MISSING` and never invents
intrinsics. Use the Python `calibrate-intrinsics` command for the complete
calibration workflow, then import its JSON into the page.
