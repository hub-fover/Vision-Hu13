# LAB 002 — Mobile Panorama Stitch

LAB 002 is an isolated, local-only panorama-stitch teaching project. Its
Python pipeline and mobile-first Web application share
[`shared/contracts.json`](shared/contracts.json), so quality gates and errors
remain consistent across runtimes.

## Layout

- `python/panorama_stitch/` — Python 3.11–3.12 teaching package.
- `web/` — subpath-safe mobile Web application for `/Vision-Hu13/lab-002/`.
- `shared/` — portable defaults, error codes, and public contract documentation.
- `tests/` — isolated Python and Node tests.
- `assets/`, `article/`, and `docs/figures/` — real-media and publication work.
- `scripts/` — repeatable local asset and verification helpers.

LAB 001 remains the repository root experience. See
[`docs/CONTRACTS.md`](docs/CONTRACTS.md) for shared API semantics and
[`LICENSES.md`](LICENSES.md) for license boundaries.

## Real samples

The default mountain sequence and the city/ocean acceptance sequences are
genuine timestamped frames from three licensed Pexels panning videos. The Web
app reads its same-origin `web/assets/samples/manifest.json`; it never fetches
Pexels or sends a selected image away from the device. The mountain files are
also bundled as Python package resources, so running the CLI without paths
uses the same three frames.

Full source pages, video versions, timestamps, transformations, checksums, and
all local copies are recorded in
[`assets/asset-manifest.json`](assets/asset-manifest.json) and
[`assets/SOURCES.md`](assets/SOURCES.md).

## Reproducible verification and Pages staging

LAB 002 pins the Python packages used by stitching, sample extraction, and
technical-figure regeneration in
[`requirements-lock.txt`](requirements-lock.txt). The pins support Python
3.11 and 3.12 and are mirrored by `pyproject.toml`.

From the repository root, run:

```powershell
python -m pip install -e ".[dev]" -e "./lab-002[test]"
npm ci
npm ci --prefix lab-002/web
npm run test:lab002
npm run build:lab002
npm run validate:lab002:release
```

The acceptance validator checks cross-runtime transforms, median reprojection
error, color parity away from the seam boundary, hole-free safe crop, mobile
and HD memory/output limits, the committed mountain sequence, runtime privacy,
lazy same-origin OpenCV loading, and its 8 MiB compressed ceiling.

`build:lab002` leaves the LAB 001 files at `web/` unchanged and generates the
ignored Pages staging directory at `web/lab-002/`. Staging validation fails on
missing Worker, OpenCV, sample, or article-linked runtime resources and on
remote or root-absolute runtime references. CI runs the LAB 001 regressions
alongside LAB 002 Python 3.11/3.12, Node, real Worker, Pixel 7, provenance,
deterministic-figure, article, gzh-compatible HTML, and Pages gates.

Real Android Chrome and iPhone Safari capture remains
`PENDING_DEVICE_CAPTURE`; verification does not generate GIF, MP4, or WebM.

Rebuild the JPEG derivatives from the three approved MP4 files in ignored
temporary storage:

```powershell
python scripts/extract_real_samples.py --video-dir C:\tmp\lab002-real-videos
python scripts/validate_public_assets.py .
```
