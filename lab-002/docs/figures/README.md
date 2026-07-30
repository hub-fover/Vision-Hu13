# Figures

Figures must annotate real input frames, real panorama output, or real
algorithm diagnostics. Programmatic or AI-generated scene imagery is excluded.

The ten numbered PNGs are generated deterministically from the committed
mountain and ocean frames by:

```powershell
$env:PYTHONPATH = (Resolve-Path ..\..\python)
python ..\..\scripts\generate_technical_figures.py
```

`figure-manifest.json` records the public source, license and real base files.
The editable JSON files in `source-data/` retain input checksums, actual
algorithm measurements and overlay definitions. Every PNG is 1080px wide and
visibly carries the required real-input label and nearby Pexels credit.
