# LAB 003: Three-exposure fusion

LAB 003 combines a dark, normal, and bright JPEG into one locally processed
image. It implements the contrast, saturation, and well-exposedness weighting
described by Mertens et al., multi-resolution pyramid blending, affine hand-shake
alignment, and conservative motion protection.

```powershell
python -m exposure_fusion dark.jpg normal.jpg bright.jpg --output fusion.jpg
```

Run with no image arguments to use the packaged MIT-licensed sample. Add
`--debug-dir debug` to export intermediate evidence.

This is exposure fusion. It does not recover calibrated HDR radiance and does
not reproduce a phone manufacturer's computational-photography pipeline.
