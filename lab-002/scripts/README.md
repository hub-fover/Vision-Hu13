# Scripts

Repeatable helpers for validated real-media preparation and release checks:

- `extract_real_samples.py` extracts the ten timestamped Pexels frames.
- `generate_technical_figures.py` renders the ten real-input diagnostic figures.
- `validate_public_assets.py` verifies samples, figures and publication honesty.
- `validate_acceptance.py` runs cross-runtime, budget, privacy and real-mountain
  release gates.
- `stage-pages.mjs` stages and validates the complete subpath-safe Pages app.
- `REAL_DEVICE_CAPTURE.md` defines the physical Android/iPhone acceptance flow.

The true-device media status remains machine-readable in
`../assets/real-device-media-status.json`. No public GIF, MP4 or WebM is
created while that status is `PENDING_DEVICE_CAPTURE`.
