# LAB 002 — Mobile Panorama Stitch

LAB 002 is an isolated, local-only panorama-stitch teaching project. Its future
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
