# Video, frame sequence and mobile camera implementation plan

Goal: deepen the three real motion experiments with chronological processing, background adaptation and persistent feature tracks. Preserve real-only examples and all existing photo labs.

Architecture: media-input.mjs decodes bounded, same-sized local frames and handles camera permission; temporal-core.mjs computes stateful numeric results in temporal.worker.mjs; temporal.mjs renders timeline, metrics, comparison views and exports. No upload/server.

- [ ] Add numerical tests for EMA background, components and persistent LK forward/backward tracks; run red then implement.
- [ ] Add genuine OpenCV vtest excerpt and frame sequence with pinned provenance, dimensions, timestamps and hashes.
- [ ] Add local video/image sequence and camera capture, rear/front switching, real-time processing, cancellation and teardown.
- [ ] Add playback/single step/time scrub, trajectories, per-frame curves, parameter replay, PNG/JSON exports and teaching comparisons.
- [ ] Browser acceptance: real default frames, ordered uploads, video decoding, camera lifecycle using a test stream, malformed inputs, cancellation/navigation, mobile layout and regression.
- [ ] Independent review, fix findings, merge, Pages deployment, online verification, source/static packages and teacher notes.

Limits: 384x288 work resolution; at most 120 sampled frames for replay; cameras use 60-result bounded history with persistent state. Camera permission is user initiated on HTTPS. JPEG/PNG/WebP sequences sort numeric filenames and require equal original dimensions. Unsupported video codecs produce explicit errors. Relative frame speed is pixels/second only when sampling timestamps are known. Feature IDs are not object/person identities; no unlabelled accuracy scores.
