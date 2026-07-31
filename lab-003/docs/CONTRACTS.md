# Shared contracts

`shared/contracts.json` is the source of truth for LAB 003. Both runtimes accept
exactly three JPEG, PNG, or WebP images, order them by relative luminance, align
the dark and bright frames to the middle exposure, and cap output at 4MP.

The public report contains exposure, alignment, motion, crop, and memory
evidence. Relative exposure values are teaching diagnostics, not calibrated EV
or scene-radiance measurements.

Processing is local-only. The Web runtime must not upload or persist selected
images and must lazy-load its same-origin OpenCV dependency inside a Worker.
