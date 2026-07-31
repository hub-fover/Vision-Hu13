# LAB 003 Fact Review

## Scope

Review date: 2026-07-31. Reviewed `article.md`, shared contracts, Python implementation, Web implementation, tests, and pinned sample provenance.

## Findings

- The article consistently describes the method as exposure fusion, not radiance HDR reconstruction.
- The three quality measures and multi-resolution blending description agrees with Mertens et al.
- ORB is described only as a feature matching tool; the article does not claim it understands scene content.
- Alignment limits are presented as LAB 003 implementation choices, not universal photography thresholds.
- Motion protection is accurately described as preferring the middle exposure in detected motion regions. No full deghosting claim remains.
- Privacy claims are supported by source inspection and automated tests rejecting persistence, telemetry, and upload APIs.
- The article does not infer or describe proprietary Apple/Google implementation details.
- Sample provenance is pinned to a commit containing the MIT license, with SHA-256 recorded.

## Residual Limits

- Camera behavior differs across Android and iOS browsers; `capture="environment"` is a hint to the system picker, not a guarantee of a specific camera UI.
- The page cannot recover details clipped in all three source frames.
- Device-level camera return and native share still require final physical-device smoke testing outside CI.
