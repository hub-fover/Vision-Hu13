import assert from "node:assert/strict";
import test from "node:test";
import { validateFiles } from "../../web/js/capture.js";
import { createState, replaceFiles, setFileAt } from "../../web/js/state.js";

const file = (name, type = "image/jpeg") => ({ name, type });

test("three camera slots retain their positions", () => {
  let state = createState();
  state = setFileAt(state, 2, file("bright.jpg"));
  state = setFileAt(state, 0, file("dark.jpg"));
  assert.equal(state.files[2].name, "bright.jpg");
  assert.equal(state.files[1], null);
  state = setFileAt(state, 1, file("normal.jpg"));
  assert.equal(state.phase, "ready");
});

test("gallery selection requires exactly three supported files", () => {
  assert.equal(validateFiles([file("a.jpg"), file("b.jpg"), file("c.jpg")]).length, 3);
  assert.throws(() => validateFiles([file("a.jpg")]), { code: "INVALID_IMAGE_COUNT" });
  assert.throws(() => validateFiles([file("a.heic", "image/heic"), file("b.jpg"), file("c.jpg")]), { code: "UNSUPPORTED_FORMAT" });
  assert.equal(replaceFiles(createState(), [file("a.jpg"), file("b.jpg"), file("c.jpg")]).phase, "ready");
});
