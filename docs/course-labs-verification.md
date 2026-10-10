# Course Labs verification — 2026-10-10

## Actual local evidence

- Node 24.14.1, Google Chrome through Playwright 1.62.0, Windows.
- `npm run test:course`: 85 numerical/contract tests pass, one release-layout test passes, browser runner visits all 24 experiment URLs.
- Browser runner checks desktop1440×1000 and mobile390×844 for every experiment: real Worker result, stages, stepping, playback/pause, baseline comparison, reset reproducibility, teacher URL and zero horizontal overflow. Screenshots were produced for all scenes and sample screenshots visually inspected.
- Separate browser checks pass: local image consumption, PNG magic bytes, JSON exported grayscale shape, invalid image/seed recovery, cancel after start and cancel before debounce, unknown-route fallback, surface keyboard rotation, no external requests or page errors.
- Independent code review found SFS energy/gradient mismatch, strong-smoothing instability and a pending-debounce cancellation bug. All fixed with regression coverage; scoped review found no residual actionable findings.
- Repository root `npm test`: 71 existing web tests pass. `node --test feature-extraction/tests/*.test.mjs`: 73 existing numerical/real-Worker/browser tests pass, including maximum-size Workers.

## Limits

Viewport simulation is not phone hardware testing. Lightweight mechanism experiments have the explicit model/geometry limitations documented in course-labs/README.md. Numerical success on synthetic data is not a claim of real-world model accuracy or measurement precision.

Pages deployment and online smoke results will be recorded after actual publication; this local record does not itself claim online deployment.
