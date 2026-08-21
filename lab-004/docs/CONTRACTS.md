# LAB 004 Measurement Contract

`shared/contracts.json` is the source of truth for the browser and Python
implementations. Internal lengths are metres; the UI accepts `mm`, `cm`, or
`m` and converts them before tracking.

The user supplies a `TargetRegion` and a `ScaleReference` with two image points
and their real separation. The camera must remain fixed. Each
`TrackingSample` reports pixel and metre displacement, a matching score, a
valid flag, and an optional stable error code.

The default tracker is template matching. `flow` is an optional Lucas–Kanade
teaching path, and `dic` is Python-only. A report includes displacement
statistics, a spectrum peak when at least 128 monotonic samples are available,
and diagnostics for camera/background stability and valid ratio.

When the target is lost, the background cannot be tracked, the camera moves, or
timestamps are invalid, the implementation must stop presenting stale values
and return one of the error codes listed in the JSON contract.
