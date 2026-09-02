# LAB 005 contracts

All lengths are metres and image coordinates are pixels after EXIF orientation.
The input stack has exactly five frames, ordered from near focus to far focus
when the camera exposes a focus index. Relative depth is normalised to `[0, 1]`
(`0` nearest in the stack, `1` farthest). A confidence below `0.45` is invalid;
`0.45..0.70` is reference quality and `>=0.70` is stable.

The machine-readable defaults and stable error codes live in
`lab-005/shared/contracts.json`. Python and JavaScript must preserve these
names when serialising reports.

## Public types

- `FocusFrame`: one EXIF-corrected analysis frame plus its ordered focus index.
- `FocusStack`: exactly five compatible `FocusFrame` values from one scene.
- `FocusMetricCurve`: five focus scores and the fitted peak for one tile.
- `RelativeDepthMap`: normalised depth, confidence and invalid-mask arrays.
- `DepthSample`: a queried tile position with relative and optional metric depth.
- `CameraIntrinsics`: versioned camera matrix, distortion and image compatibility metadata.
- `FocusCalibration`: the ordered focus sweep and camera/lens compatibility metadata.
- `DepthScaleCalibration`: monotone focus-index-to-distance reference mapping.
- `DepthResult`: computed maps, dimensions and quality summary.
- `DepthReport`: serialisable status, quality and diagnostic metadata.

`CameraIntrinsics` uses `lab005.camera-intrinsics.v1` and
`DepthScaleCalibration` uses `lab005.focus-depth-scale.v1`. Unknown schemas,
image-size mismatches and non-monotone scale mappings are rejected rather than
silently converted.

Metric depth is emitted only when both calibration files are present. A scale
calibration records `intrinsicsSchema`, `imageSize`, `lensId`, `orientation`
and `zoom`; these must match the camera intrinsics and the current analysis
stack. Metric values and their fitted residual remain `reference-only`.
