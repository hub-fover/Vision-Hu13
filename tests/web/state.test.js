import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptRendered, addDefaultCorner, addPoint, applyPreset, beginRender, canExport,
  createEditorState, markPreviewValid, nudgeSelectedPoint, removeSelectedPoint,
  selectPoint,
  movePoint, resetEditor, setAsset, setBackground, setCompare,
  setGeometryError, updateOption,
} from "../../web/js/state.js";

test("editor state starts safe and cannot export", () => {
  const state = createEditorState();
  assert.deepEqual(state.points, []);
  assert.equal(state.currentError, null);
  assert.equal(state.lastValidPreview, null);
  assert.equal(state.assetType, "text");
  assert.equal(state.compare, 1);
  assert.equal(canExport(state), false);
});

test("four points are capped and movable", () => {
  let state = createEditorState();
  [[10, 10], [90, 10], [90, 90], [10, 90], [50, 50]].forEach((point) => {
    state = addPoint(state, point);
  });
  assert.deepEqual(state.points, [[10, 10], [90, 10], [90, 90], [10, 90]]);
  state = movePoint(state, 1, [80, 12]);
  assert.deepEqual(state.points[1], [80, 12]);
});

test("invalid current geometry retains preview but disables export", () => {
  let state = createEditorState();
  state = setBackground(state, { width: 640, height: 480 });
  state = setAsset(state, { kind: "png", width: 100, height: 80 });
  [[10, 10], [200, 10], [200, 200], [10, 200]].forEach((point) => {
    state = addPoint(state, point);
  });
  state = markPreviewValid(state, { id: "preview" });
  assert.equal(canExport(state), true);
  state = setGeometryError(state, "SELF_INTERSECTION");
  assert.deepEqual(state.lastValidPreview, { id: "preview" });
  assert.equal(canExport(state), false);
});

test("presets and option updates are immutable", () => {
  const original = createEditorState();
  const preset = {
    blendMode: "multiply", opacity: 0.78,
    shadow: { enabled: false, opacity: 0 },
  };
  const applied = applyPreset(original, "wall", preset);
  const updated = updateOption(applied, "shadow.opacity", 0.4);
  assert.equal(original.preset, "wall");
  assert.equal(applied.options.opacity, 0.78);
  assert.equal(applied.options.shadow.opacity, 0);
  assert.equal(updated.options.shadow.opacity, 0.4);
});

test("compare clamps and reset preserves loaded resources", () => {
  let state = createEditorState();
  state = setBackground(state, { width: 10, height: 10 });
  state = setAsset(state, { kind: "png", width: 2, height: 2 });
  assert.equal(setCompare(state, 2).compare, 1);
  assert.equal(setCompare(state, -1).compare, 0);
  state = resetEditor(state);
  assert.deepEqual(state.points, []);
  assert.equal(state.background.width, 10);
  assert.equal(state.asset.kind, "png");
});

test("a point mutation rejects an older worker response", () => {
  let state = createEditorState();
  state = setBackground(state, { width: 640, height: 480 });
  state = setAsset(state, { kind: "png", width: 10, height: 10 });
  [[0, 0], [100, 0], [100, 100], [0, 100]].forEach((point) => {
    state = addPoint(state, point);
  });
  const started = beginRender(state);
  state = started.state;
  state = movePoint(state, 0, [1, 1]);
  state = acceptRendered(state, started.version, { id: "stale" });
  assert.equal(state.rendered, null);
});

test("every render-input mutation invalidates the current render version", () => {
  const original = createEditorState();
  const background = setBackground(original, { width: 1, height: 1 });
  const asset = setAsset(background, { kind: "png", width: 1, height: 1 });
  const point = addPoint(asset, [0, 0]);
  const option = updateOption(point, "opacity", 0.5);
  const preset = applyPreset(option, "poster", { opacity: 1, shadow: {} });
  const reset = resetEditor(preset);
  assert.deepEqual([
    background.renderVersion, asset.renderVersion, point.renderVersion,
    option.renderVersion, preset.renderVersion, reset.renderVersion,
  ], [1, 2, 3, 4, 5, 6]);
});

test("keyboard selection, one-pixel and shift ten-pixel nudges are stateful", () => {
  let state = createEditorState();
  state = addPoint(state, [20, 20]);
  state = selectPoint(state, 0);
  const version = state.renderVersion;
  state = nudgeSelectedPoint(state, 1, -1, 100, 100);
  assert.deepEqual(state.points[0], [21, 19]);
  assert.equal(state.renderVersion, version + 1);
  state = nudgeSelectedPoint(state, 10, 0, 25, 100);
  assert.deepEqual(state.points[0], [25, 19]);
});

test("space defaults corners in TL TR BR BL order and delete removes selection", () => {
  let state = createEditorState();
  for (let count = 0; count < 4; count += 1) {
    state = addDefaultCorner(state, 200, 100);
  }
  assert.deepEqual(state.points, [[30, 15], [170, 15], [170, 85], [30, 85]]);
  state = selectPoint(state, 1);
  state = removeSelectedPoint(state);
  assert.deepEqual(state.points, [[30, 15], [170, 85], [30, 85]]);
  assert.equal(state.selectedPoint, 1);
});
