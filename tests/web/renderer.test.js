import assert from "node:assert/strict";
import test from "node:test";
import {
  drawImageBitmapToCanvas, drawVanishingOverlay, meshSubdivisionCount, replaceTrackedFont,
  triangleTransform,
} from "../../web/js/renderer.js";

test("triangle affine transform maps all three source vertices", () => {
  const source = [[0, 0], [2, 0], [0, 2]];
  const destination = [[10, 20], [14, 20], [10, 26]];
  const [a, b, c, d, e, f] = triangleTransform(source, destination);
  const project = ([x, y]) => [a * x + c * y + e, b * x + d * y + f];
  source.forEach((point, index) => assert.deepEqual(project(point), destination[index]));
});

test("adaptive mesh increases subdivisions for a larger projective quad and caps work", () => {
  const small = [[0, 0], [80, 4], [60, 55], [5, 45]];
  const large = [[0, 0], [960, 40], [720, 660], [40, 540]];
  assert.ok(meshSubdivisionCount(large) > meshSubdivisionCount(small));
  assert.equal(meshSubdivisionCount([[0, 0], [5000, 0], [5000, 5000], [0, 5000]]), 28);
});

test("drawing an ImageBitmap closes it even when drawing fails", () => {
  let closed = 0;
  const bitmap = { width: 2, height: 3, close() { closed += 1; } };
  const canvasFactory = () => ({
    width: 0,
    height: 0,
    getContext() {
      return { drawImage() { throw new Error("draw failed"); } };
    },
  });
  assert.throws(() => drawImageBitmapToCanvas(bitmap, canvasFactory), /draw failed/);
  assert.equal(closed, 1);
});

test("replacing an uploaded font removes the previous tracked face", () => {
  const calls = [];
  const fontSet = {
    add(face) { calls.push(["add", face]); },
    delete(face) { calls.push(["delete", face]); return true; },
  };
  const previous = { family: "old" };
  const next = { family: "new" };
  assert.equal(replaceTrackedFont(fontSet, previous, next), next);
  assert.deepEqual(calls, [["delete", previous], ["add", next]]);
});

function recordingContext(width = 200, height = 200) {
  const calls = [];
  const context = {
    canvas: { width, height },
    calls,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    stroke() {},
    fill() {},
    setLineDash(value) { calls.push(["dash", ...value]); },
    moveTo(x, y) { calls.push(["point", x, y]); },
    lineTo(x, y) { calls.push(["point", x, y]); },
    arc(x, y) { calls.push(["point", x, y]); },
    fillText(value, x, y) { calls.push(["text", value, x, y]); },
  };
  return context;
}

test("vanishing overlay uses bounded arrows, labels, and the visible plane line", () => {
  const context = recordingContext();
  const quad = [[60, 70], [140, 90], [120, 140], [80, 120]];

  drawVanishingOverlay(context, quad);

  const points = context.calls.filter(([kind]) => kind === "point");
  assert.ok(points.length > 6);
  points.forEach(([, x, y]) => {
    assert.ok(x >= 0 && x <= 200, `x=${x}`);
    assert.ok(y >= 0 && y <= 200, `y=${y}`);
  });
  const labels = context.calls.filter(([kind]) => kind === "text")
    .map(([, value]) => value);
  assert.ok(labels.some((value) => value.includes("V1 画外约")));
  assert.ok(labels.includes("V2"));
  assert.ok(context.calls.some(([kind, first, second]) =>
    kind === "dash" && first === 8 && second === 6));
});

test("vanishing overlay labels infinite directions without huge coordinates", () => {
  const context = recordingContext();

  drawVanishingOverlay(context, [[20, 20], [180, 20], [180, 140], [20, 140]]);

  const labels = context.calls.filter(([kind]) => kind === "text")
    .map(([, value]) => value);
  assert.ok(labels.includes("U 该方向近似平行"));
  assert.ok(labels.includes("V 该方向近似平行"));
  context.calls.filter(([kind]) => kind === "point").forEach(([, x, y]) => {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= 0 && x <= 200);
    assert.ok(y >= 0 && y <= 200);
  });
});
