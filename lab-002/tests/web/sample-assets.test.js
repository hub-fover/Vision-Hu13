import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const labRoot = path.resolve(here, "../..");

test("real sample loader uses a same-origin manifest rather than hard-coded remote URLs", () => {
  const source = fs.readFileSync(path.join(labRoot, "web/js/app.js"), "utf8");

  assert.match(source, /SAMPLE_MANIFEST_URL/);
  assert.match(source, /assets\/samples\/manifest\.json/);
  assert.doesNotMatch(source, /pexels\.com|videos\.pexels\.com/i);
});

test("web sample manifest exposes all real sequences with local JPEG files", () => {
  const manifestPath = path.join(labRoot, "web/assets/samples/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.deepEqual(Object.keys(manifest.sequences).sort(), ["city", "mountains", "ocean"]);
  for (const sequence of Object.values(manifest.sequences)) {
    assert.equal(sequence.isGenerated, false);
    assert.equal(sequence.isThirdParty, true);
    assert.ok(sequence.files.length >= 3);
    for (const relative of sequence.files) {
      assert.match(relative, /^\.[/\\]/);
      assert.ok(fs.existsSync(path.resolve(path.dirname(manifestPath), relative)));
    }
  }
});
