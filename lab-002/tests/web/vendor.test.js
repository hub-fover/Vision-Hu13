import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("OpenCV 4.12 vendoring is version-pinned, same-origin, and measures gzip size", async () => {
  const [script, packageJson, readme] = await Promise.all([
    readFile(new URL("../../scripts/vendor_opencv.py", import.meta.url), "utf8"),
    readFile(new URL("../../web/package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../../web/vendor/README.md", import.meta.url), "utf8"),
  ]);

  assert.match(script, /VERSION = "4\.12\.0"/);
  assert.match(script, /opencv-4\.12\.0-docs\.zip/);
  assert.match(script, /zipfile/);
  assert.match(script, /sha256/);
  assert.match(script, /gzip/);
  assert.match(script, /8 \* 1024 \* 1024/);
  assert.equal(
    packageJson.scripts["vendor:opencv"],
    "python ../scripts/vendor_opencv.py",
  );
  assert.match(readme, /Apache 2\.0/);
  assert.match(readme, /not loaded from a CDN/i);
});
