# OpenCV.js runtime boundary

LAB 002 pins `@techstark/opencv-js@4.12.0-release.1`, licensed under
Apache 2.0. The reviewed npm package has an unpacked size of 12,298,343 bytes
and is not loaded from a CDN at runtime.

Run from `lab-002/web`:

```powershell
npm.cmd run vendor:opencv
```

The script verifies the exact installed package version and license, copies
`dist/opencv.js` into this same-origin directory, records artifact SHA-256 and
deterministic gzip size, and refuses an artifact above the 8 MiB target.

The generated `opencv.js` and `manifest.local.json` are intentionally ignored.
E2E runs and Pages packaging invoke this required step. Keeping the copied
binary out of source control avoids duplicating a pinned dependency while
preserving a same-origin runtime.
