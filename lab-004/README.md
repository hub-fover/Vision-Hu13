# LAB 004: Camera Pose and Measurement

LAB 004 estimates a camera pose from a known rectangular plane target, reports
camera-to-plane measurements in metres, and quantifies distance uncertainty.
It is a standalone package and does not import runtime code from LAB 001-003.

The public cross-runtime contract is `shared/contracts.json`. Image points are
always expressed in the EXIF-corrected analysis image, whose long side is at
most 1280 pixels. Plane corners use TL, TR, BR, BL order. The centered object
frame uses X plane-right, Y plane-up, and Z plane-out.

Install and test with Python 3.11 or 3.12:

```powershell
python -m pip install -r requirements-lock.txt
python -m pytest
```

The Python API lives in the `camera_pose` package. All physical lengths in its
serializable results use metres. Euler angles are presentation values in the
documented intrinsic ZYX convention; rotation matrices and Rodrigues vectors
remain the interchange representation.
