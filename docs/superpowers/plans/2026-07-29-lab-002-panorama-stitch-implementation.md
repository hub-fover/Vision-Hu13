# LAB 002｜手机端全景图像拼接实施计划

## Global Constraints

- Add LAB 002 under `lab-002/`; do not move or break LAB 001.
- Keep the Pages root serving LAB 001; publish LAB 002 at `/Vision-Hu13/lab-002/`.
- Python supports 3.11–3.12. Web is mobile-first, local-only, and has no image upload.
- Public photos, figures, covers, GIF, and video must use real captured media or real device recordings. Do not use AI-generated or programmatic scene imagery.
- Product image count has no hard limit. Warn above 6 images or 60 source megapixels.
- Default export is JPEG quality 92 capped at 12MP. HD is capped at 24MP and a 384MiB estimated working set.
- Do not implement cylindrical/spherical projection, bundle adjustment, multiband blending, automatic all-pairs ordering, manual registration, deghosting, or 360-degree closure.
- Use TDD for production behavior and preserve all LAB 001 tests.

## Task 1: Scaffold shared contracts and repository integration

Create the isolated `lab-002/` project structure with its own Python package, Web package, shared JSON, tests, assets, article, figures, scripts, and documentation.

Define the shared defaults:

- `analysisMaxSide=1280`
- `maxFeatures=2500`
- `ratioThreshold=0.75`
- `ransacThresholdPx=3`
- `minInliers=20`
- `minInlierRatio=0.25`
- `maxMedianErrorPx=2.5`
- exposure gain range `0.7–1.3`
- `blendWidthPx=96`
- mobile output `12MP`
- HD output `24MP`
- `maxWorkingSetMiB=384`
- warnings above 6 images or 60MP
- JPEG quality `0.92`

Define error codes:

`NOT_ENOUGH_IMAGES`, `UNSUPPORTED_FORMAT`, `DECODE_FAILED`, `LOW_TEXTURE`,
`INSUFFICIENT_OVERLAP`, `AMBIGUOUS_MATCHES`, `HOMOGRAPHY_UNSTABLE`,
`HIGH_REPROJECTION_ERROR`, `OUTPUT_TOO_LARGE`, `CANCELLED`.

Define and document `StitchOptions` and `MatchMetrics`. Add license boundaries:
project code MIT, original prose/annotations CC BY 4.0, OpenCV Apache 2.0,
third-party media retains its source license.

Add root proxy commands and documentation links without changing the LAB 001
default Pages experience.

## Task 2: Implement the Python teaching pipeline

Create package `panorama_stitch` and CLI:

```powershell
python -m panorama_stitch image1.jpg image2.jpg [...] `
  --output panorama.jpg `
  [--quality mobile|hd] `
  [--debug-dir debug]
```

Public Python APIs:

- `extract_features`
- `match_pair`
- `estimate_homography`
- `compose_transforms`
- `warp_images`
- `blend_panorama`
- `auto_crop`
- `stitch_images`

Pipeline:

1. Decode JPEG/PNG/WebP and apply EXIF transpose.
2. Resize analysis images to a 1280px maximum side.
3. Extract ORB features.
4. BF-Hamming KNN match, Lowe ratio filter, and mutual consistency check.
5. Estimate adjacent homographies with RANSAC.
6. Validate match count, inlier ratio, reprojection error, homography condition, and transformed bounds.
7. Compose transforms around the middle image.
8. Estimate the output canvas and memory budget.
9. Apply overlap exposure gain clamped to 0.7–1.3 and 96px mask-distance feathering.
10. Find the largest safe crop rectangle and inset it by 2px.

No-argument CLI execution uses the packaged real mountain sequence. `--debug-dir`
exports real-input feature, match, inlier, transform, seam, and exposure
diagnostics. Invalid pairs name the pair and return an actionable error.

Write failing pytest cases first for options, EXIF, feature failures, matching,
homography gates, composition, blending, crop, memory limits, public APIs, CLI,
and all error codes.

## Task 3: Implement the mobile-first Web application

Create a three-step vertical application:

1. Choose multiple gallery images, append a rear-camera capture, or load the real sample.
2. Reorder thumbnails with pointer drag and accessible move buttons; delete or append.
3. Run, cancel, inspect seam overlay, adjust an inward-only crop, download JPEG, or share with fallback to download.

Use separate inputs for `multiple` gallery selection and
`capture="environment"`. Keep all image data local. Provide clear progress
stages and pair-specific Chinese error messages.

Public JavaScript APIs:

- `extractFeatures`
- `matchPair`
- `estimateHomography`
- `composeTransforms`
- `warpImages`
- `blendPanorama`
- `autoCrop`
- `stitchImages`

Lazy-load a same-origin OpenCV.js/WASM build containing the needed core,
imgproc, features2d, and calib3d functionality. Run image work in a Worker,
process adjacent pairs, release Mats and bitmaps promptly, and preserve the
shared defaults and error semantics.

Write failing Node tests first for pure state/geometry/budget/crop behavior and
Playwright tests for Pixel 7 and desktop flows: selection, append, reorder,
success, cancellation, failure, crop, JPEG, share fallback, and zero image
exfiltration.

## Task 4: Add real media, annotated figures, article, and recording support

Prepare real sequences from licensed Pexels panning video:

- Mountains, cottonbro studio, video `9943097`: frames at `0.30T/0.45T/0.60T`.
- City, Zulfugar Karimov, video `36722864`: frames at `0.20T/0.35T/0.50T/0.65T`.
- Low-texture ocean failure, James Cheney, video `6746361`: frames at `0.30T/0.45T/0.60T`.

Only extract, orient, crop, color-correct, resize to a 1600px maximum side,
and encode JPEG at quality 90. Never crop one still into a fake sequence.

Record title, creator, source page, license, download date, video version,
frame timestamps, modifications, use location, and local file in both
`asset-manifest.json` and `SOURCES.md`, with `isGenerated=false` and
`isThirdParty=true`.

Create ten technical figures only by annotating real frames, real panoramas,
or real algorithm diagnostics: overlap, ORB points, candidate matches, ratio
filtering, RANSAC, canvas, middle anchor, exposure, feathering, and real failure
cases. Label them as algorithm annotations on real input.

Write the WeChat article “几张照片，怎样接成一张？” around “先找到同一个地方，
再决定谁覆盖谁”. Deliver Markdown, sources, fact review, de-AI report, and
DETAIL graphite-minimal HTML. Do not publish to WeChat drafts.

Public GIF/MP4/WebM must come from a real Android Chrome or iPhone Safari screen
recording. Add an exact capture and conversion workflow. Never substitute
Playwright/mobile emulation media for public assets.

## Task 5: Verify, integrate CI/Pages, and prepare release

Keep all LAB 001 checks green. Add LAB 002 Python 3.11/3.12 on Windows/Linux,
Node, Worker, mobile Playwright, cross-runtime geometry, asset provenance,
article, and static-resource checks.

Acceptance:

- Shared control-point transform difference no more than 2px.
- Median reprojection error no more than 2.5px.
- Python/Web mean valid-area color difference no more than 5% outside the seam.
- Safe crop contains no blank holes.
- Default three-image example targets 10 seconds; three 12MP images target 30 seconds.
- OpenCV.js/WASM compressed target no more than 8MB and lazy-loaded.
- Over-budget inputs warn, downsample, or fail clearly rather than hang.

Build Pages with existing `web/` at the root and LAB 002 at `lab-002/`, using
subpath-safe relative resources. Validate both live paths and do not publish if
product assertions fail.
