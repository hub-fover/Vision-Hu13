# Task 3 report — LAB 002 Web application

Status: **DONE_WITH_CONCERNS**

Implementation commit: `5e93bbc15f6703fff1975cff2bdbaefd8b1c2e4c`

## Delivered

- Mobile-first three-step UI with separate multi-gallery and
  `capture="environment"` inputs.
- Append-only intake, local previews, pointer/HTML drag reordering, accessible
  move/delete buttons, count/megapixel warnings, mobile/HD selection.
- Worker progress, cooperative cancellation, pair-specific Chinese errors,
  seam overlay, inward-only crop controls, JPEG download, Web Share with
  download fallback.
- All eight public JavaScript APIs:
  `extractFeatures`, `matchPair`, `estimateHomography`, `composeTransforms`,
  `warpImages`, `blendPanorama`, `autoCrop`, and `stitchImages`.
- Shared defaults/error semantics mirrored in focused Web modules.
- Adjacent-pair ORB → BF-Hamming KNN → ratio/mutual filter → RANSAC pipeline,
  middle-anchor composition, bounded canvas planning, warping, exposure clamp,
  distance-transform feathering, safe crop, and explicit Mat/bitmap cleanup.
- Lazy, same-origin classic Worker loading of `../vendor/opencv.js`; no image
  upload, analytics, remote font, CDN runtime, XHR, WebSocket, or beacon.
- Stable relative Task 4 sample paths with an explicit empty-media recovery
  message.
- Reproducible official OpenCV 4.12 docs-archive vendoring script with optional
  expected SHA-256 checks, generated provenance, deterministic gzip
  measurement, required-module record, and an 8 MiB refusal gate.

## Files

Product:

- `lab-002/web/index.html`
- `lab-002/web/styles.css`
- `lab-002/web/js/app.js`
- `lab-002/web/js/contracts.js`
- `lab-002/web/js/crop.js`
- `lab-002/web/js/errors.js`
- `lab-002/web/js/geometry.js`
- `lab-002/web/js/opencv-adapter.js`
- `lab-002/web/js/panorama.js`
- `lab-002/web/js/panorama.worker.js`
- `lab-002/web/js/state.js`
- `lab-002/web/js/worker-client.js`
- `lab-002/web/package.json`

Vendoring:

- `lab-002/scripts/vendor_opencv.py`
- `lab-002/web/vendor/.gitignore`
- `lab-002/web/vendor/README.md`

Tests:

- `lab-002/playwright.config.js`
- `lab-002/tests/e2e/global-setup.js`
- `lab-002/tests/e2e/panorama.spec.js`
- `lab-002/tests/e2e/server.mjs`
- `lab-002/tests/web/crop.test.js`
- `lab-002/tests/web/geometry.test.js`
- `lab-002/tests/web/pipeline.test.js`
- `lab-002/tests/web/state.test.js`
- `lab-002/tests/web/ui-contract.test.js`
- `lab-002/tests/web/vendor.test.js`

## TDD evidence

Clean baseline before implementation:

```text
npm.cmd --prefix lab-002/web test
3 passed, 0 failed

npm.cmd run test:web
71 passed, 0 failed
```

Initial Node RED:

```text
npm.cmd --prefix lab-002/web test
exit 1 — 3 passed, 6 failed
ERR_MODULE_NOT_FOUND for crop.js, geometry.js, panorama.js, state.js;
UI contract failed because the placeholder page had no inputs/app module.
```

Focused orchestration RED:

```text
node --test lab-002/tests/web/pipeline.test.js
exit 1 — 3 passed, 4 failed
Expected failure: placeholder stitchImages reported the unavailable adapter;
Worker and OpenCV adapter files did not exist.
```

Browser RED:

```text
npm.cmd --prefix lab-002/web run test:e2e -- --project=pixel-7 --grep selection
exit 1 — locator #gallery-input timed out on the placeholder page.
```

Vendoring RED:

```text
node --test lab-002/tests/web/vendor.test.js
exit 1 — vendor_opencv.py did not exist.
```

Final GREEN:

```text
npm.cmd --prefix lab-002/web test
23 passed, 0 failed

npm.cmd --prefix lab-002/web run test:e2e
10 passed, 0 failed
```

## Final commands and output

```text
node --check <all LAB 002 .js/.mjs files>
Checked 20 JavaScript files

python -m py_compile lab-002/scripts/vendor_opencv.py
exit 0

npm.cmd --prefix lab-002/web test
23 passed, 0 failed

npm.cmd --prefix lab-002/web run test:e2e
10 passed, 0 failed

npm.cmd run test:web
71 passed, 0 failed

npm.cmd run test:e2e
2 passed, 0 failed

git diff --check
exit 0
```

## Browser evidence

Playwright used installed Chrome with two projects:

- Pixel 7 device profile: 5/5.
- Desktop 1440×1000: 5/5.
- Behaviors exercised in a real browser: gallery selection, camera append,
  accessible move, drag reorder, Worker success presentation, progress,
  cancellation, pair failure, seam toggle, inward crop, JPEG download, Web
  Share rejection/download fallback, and no off-origin HTTP(S) request after
  selecting and stitching.

UI E2E injects a deterministic Worker boundary so it can exercise browser
controller behavior without committing generated public imagery or depending
on the unavailable OpenCV binary. Node tests separately exercise adjacent-pair
orchestration, transform evidence, cancellation, resource release, Worker
loading constraints, and required OpenCV calls.

## Self-review

- Confirmed all runtime app URLs are relative/same-origin. The only product
  `fetch()` loads the three relative Task 4 sample URLs.
- Confirmed Worker/client source contains no `http://`, `https://`, `fetch`,
  XHR, WebSocket, form submission, or beacon path.
- Confirmed source-count and source-megapixel warnings use shared thresholds;
  canvas planning enforces 12/24 MP and 384 MiB.
- Confirmed every returned OpenCV Mat family is released through local
  `finally` blocks or the pipeline resource stack; transferred bitmaps close
  immediately after decode.
- Confirmed LAB 001 files were not changed and its Node/E2E regressions pass.
- `git diff --check` is clean.

## Concerns

1. **OpenCV artifact unavailable in this environment.** The documented
   `https://docs.opencv.org/4.12.0/opencv.js` URL returned 404. The official
   4.12 docs archive download reset once and timed out once, so raw/gzip
   `opencv.js` bytes and SHA-256 could not be measured honestly. No binary was
   committed and no required module/algorithm was silently removed. Run
   `npm.cmd run vendor:opencv` from `lab-002/web` in a networked build
   environment; the script records hashes/sizes and exits 2 above the 8 MiB
   gzip target unless explicitly overridden.
2. **Real OpenCV browser stitching remains an integration gate.** The actual
   adapter is implemented, but browser E2E uses a deterministic Worker stub
   because the official runtime artifact was unavailable. A vendored-artifact
   smoke test on the Task 4 real photos is still required before release.
3. **Real samples intentionally absent.** Task 4 owns the licensed mountain
   media. The current sample button recovers clearly from 404 and uses the
   final stable relative paths.
