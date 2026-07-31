# LAB 003 Asset Sources

All public photographs are real exposure sequences. No generated scene or simulated camera recording is presented as a user capture.

## Peyrou

- Repository: `arpesenti/exposure_fusion`
- Commit: `ad19046ddfd266b431a45276c366fe03e107e3cd`
- Original files: `samples/peyrou_under.jpg`, `samples/peyrou_mean.jpg`, `samples/peyrou_over.jpg`
- License: MIT; pinned license copy at `assets/sources/peyrou/LICENSE`
- Downloaded: 2026-07-31
- Processing: the three source files are unaltered; only filenames were shortened in packaged copies. Derived fusion and technical figures are documented separately.

## Kebun and Mobil

The acceptance corpus is pinned to `ericardomuten/nightmode-exposure-fusion@72d64014a27c88aeadff91e3e8255321c316eb37`, under its MIT license. The tested Kebun bracket uses the unaltered `Kebun/3.jpg`, `Kebun/6.jpg`, and `Kebun/9.jpg` frames. They retain a clear relative-exposure spread while preserving enough texture to pass the public 30-inlier alignment gate. The more extreme `10.jpg` frame was deliberately excluded because it leaves too few exposure-invariant matches; thresholds were not relaxed to force it through.

The Mobil boundary corpus uses `Mobil/1.JPG`, `Mobil/4.JPG`, and `Mobil/10.JPG`. Its three 6000 x 4000 files total 72MP and therefore exercise the documented `OUTPUT_TOO_LARGE` boundary rather than successful fusion.
