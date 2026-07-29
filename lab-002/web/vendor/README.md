# OpenCV.js runtime boundary

LAB 002 pins the official OpenCV 4.12.0 documentation prebuilt. It is licensed
under Apache 2.0 and is not loaded from a CDN at runtime.

Run from `lab-002/web`:

```powershell
npm.cmd run vendor:opencv
```

The script downloads the versioned official docs archive, extracts only
`opencv.js`, records archive and artifact SHA-256 values, measures deterministic
gzip size, and refuses an artifact above the 8 MiB compressed target unless
`--allow-oversize` is passed explicitly. For offline or independently verified
use, pass `--archive` and either expected SHA-256 option directly to
`../scripts/vendor_opencv.py`.

The generated `opencv.js` and `manifest.local.json` are intentionally ignored.
CI/Pages packaging must run the vendoring step and can retain the generated
manifest as provenance. Keeping the binary out of source control avoids an
unexplained large generated file while preserving a same-origin runtime.
