# Demo media

The demo is a real Playwright recording of the web app. It uses the credited
Pexels billboard derivative and the project's original poster, places four
canvas control points, drags every corner into perspective, and exercises the
grid, vanishing-point, texture, comparison, and original-image controls.

The recording and original overlay are CC BY 4.0. The photographic billboard
visible in the recording remains under the Pexels License; see
[`../assets/SOURCES.md`](../assets/SOURCES.md) for the author and source page.

Regenerate all three formats from the repository root:

```powershell
node scripts/record_demo.mjs
```

The recorder serves `web/` locally on `http://127.0.0.1:4174`, records
`demo.webm` at 1080×1350, then invokes `scripts/generate_demo.py --from-webm`
to derive the exact 12-second, 24 fps `demo.mp4` and the 48-frame `demo.gif`
backup. To reuse an already-running Playwright web server instead:

```powershell
node scripts/record_demo.mjs --url http://127.0.0.1:4173
```
