import assert from "node:assert/strict";
import test from "node:test";
import {
  drawImageBitmapToCanvas, meshSubdivisionCount, replaceTrackedFont,
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
