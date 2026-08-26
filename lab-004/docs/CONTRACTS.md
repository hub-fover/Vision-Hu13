# LAB 004 static-scene speed contract

`shared/contracts.json` is the source of truth for the browser and Python
implementations. Version `lab004.static-scene-speed.v2` estimates the local,
reference-level apparent velocity of a moving phone by tracking a textured
static scene.

The user selects a static scene region and two points on the same approximate
plane whose separation is measured in the real world. Internally all lengths
are metres. LK features are filtered with a forward/backward check and fitted
with a RANSAC partial-affine model. The image motion is negated to represent
camera motion, then converted to m/s and km/h with the local scale and real
timestamps.

The report contains the latest and aggregate velocity, direction, valid ratio,
per-frame samples, and diagnostics (inliers, reprojection error, tracked points,
texture and failure intervals). It intentionally contains no fixed-camera
target displacement, vibration spectrum, DIC, aircraft-specific path, or
measurement-grade claim.

The camera should translate smoothly through an approximately planar,
textured, rigid scene. Large rotation, zoom, rolling-shutter distortion,
dynamic objects, or a moving background can invalidate the estimate. No image
or video leaves the current process.
