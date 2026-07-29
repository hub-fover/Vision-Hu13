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

Rebuild the JPEG derivatives from the three approved MP4 files in ignored
temporary storage:

```powershell
python scripts/extract_real_samples.py --video-dir C:\tmp\lab002-real-videos
python scripts/validate_public_assets.py .
```
