# LAB 007 Monocular Depth Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a mobile-first local monocular-depth experience as LAB 007.

**Architecture:** A static main-thread UI delegates pinned Depth Anything V2
inference to a Dedicated Worker. Source, tests, and staging scripts live under
`lab-007`, while the Pages artifact is generated at `web/lab-007`.

**Tech Stack:** HTML, CSS, ES modules, Canvas 2D, Dedicated Worker,
Transformers.js 4.2.0, ONNX Runtime Web, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-monocular-depth-lab-007-design.md`

## Global constraints

- Preserve LAB 001 through LAB 006.
- Serve browser runtime files from the same origin.
- Fetch only the pinned q4 model revision; do not commit model weights.
- Never label relative depth in metres.
- Keep all primary controls at least 48px high.
- Do not persist selected photos.

## Tasks

1. Add failing tests for pure depth, image, point, metric, sharing, and Worker
   client contracts; implement each module through red-green-refactor cycles.
2. Add locked dependencies, vendoring, runtime provenance, three licensed
   samples, and deterministic staging validation.
3. Implement the mobile home, processing, result, comparison, metric, and share
   flows; add browser tests for real state changes and failure recovery.
4. Add responsive and visual verification for desktop, Pixel 7 Chromium, and
   iPhone 13 WebKit, plus a separately invoked live-model WASM smoke test.
5. Extend repository scripts, CI, Pages deployment, public smoke paths, and
   root documentation. Run the full LAB 007 release gate.
6. Commit on `codex/lab-007-monocular-depth`, push, create a PR to `main`, and
   monitor CI until all required checks pass.
