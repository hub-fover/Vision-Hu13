import assert from "node:assert/strict";
import test from "node:test";

import {
  appendImages,
  createQueueState,
  moveImage,
  removeImage,
  reorderImages,
  setCrop,
  warningMessages,
} from "../../web/js/state.js";

const image = (id, width = 4000, height = 3000) => ({
  id,
  name: `${id}.jpg`,
  width,
  height,
});

test("gallery and camera selections append in arrival order", () => {
  const first = appendImages(createQueueState(), [image("a"), image("b")]);
  const second = appendImages(first, [image("camera")]);

  assert.deepEqual(second.images.map(({ id }) => id), ["a", "b", "camera"]);
  assert.equal(first.images.length, 2, "queue updates must stay immutable");
});

test("move buttons, pointer reorder, and delete preserve the selected files", () => {
  const original = appendImages(createQueueState(), [
    image("a"),
    image("b"),
    image("c"),
  ]);

  const moved = moveImage(original, "b", -1);
  assert.deepEqual(moved.images.map(({ id }) => id), ["b", "a", "c"]);

  const dragged = reorderImages(moved, "c", "b");
  assert.deepEqual(dragged.images.map(({ id }) => id), ["c", "b", "a"]);

  const removed = removeImage(dragged, "b");
  assert.deepEqual(removed.images.map(({ id }) => id), ["c", "a"]);
  assert.deepEqual(original.images.map(({ id }) => id), ["a", "b", "c"]);
});

test("warnings use the shared count and source-megapixel thresholds", () => {
  const sevenSmall = Array.from({ length: 7 }, (_, index) =>
    image(`small-${index}`, 1000, 1000));
  const twoHuge = [image("left", 8000, 4000), image("right", 8000, 4000)];

  assert.deepEqual(warningMessages(sevenSmall), [
    "已选择 7 张，建议先用不超过 6 张练习。",
  ]);
  assert.deepEqual(warningMessages(twoHuge), [
    "源照片合计 64.0MP，超过 60MP，导出时可能自动缩小。",
  ]);
});

test("manual crop can only move inward from the safe auto crop", () => {
  const state = {
    ...createQueueState(),
    autoCrop: { x: 10, y: 20, width: 300, height: 120 },
    crop: { x: 10, y: 20, width: 300, height: 120 },
  };

  assert.deepEqual(
    setCrop(state, { x: 0, y: 0, width: 999, height: 999 }).crop,
    state.autoCrop,
  );
  assert.deepEqual(
    setCrop(state, { x: 30, y: 30, width: 200, height: 80 }).crop,
    { x: 30, y: 30, width: 200, height: 80 },
  );
});
