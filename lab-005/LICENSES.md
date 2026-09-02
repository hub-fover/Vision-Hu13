# Licenses

The LAB 005 source and deterministic five-frame SVG sample are released under
the repository MIT License. The sample generator path, introducing commit and
per-file checksums are recorded in `web/assets/samples/manifest.json`.

The browser runtime is generated from
`@techstark/opencv-js@4.12.0-release.1` under Apache-2.0; its provenance,
checksum and capability boundary are written to
`web/vendor/manifest.local.json` during the build. The Python pipeline pins
OpenCV 4.12.0.88. See `THIRD_PARTY_NOTICES.md` for public attribution.
