import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("OpenCV 4.12 vendoring is pinned, same-origin, and part of Pages", async () => {
  const [script, packageJson, rootPackage, pages, readme] = await Promise.all([
    readFile(new URL("../../scripts/vendor-opencv.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../web/package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../../../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../../../.github/workflows/pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../../web/vendor/README.md", import.meta.url), "utf8"),
  ]);

  assert.equal(
    packageJson.dependencies["@techstark/opencv-js"],
    "4.12.0-release.1",
  );
  assert.equal(
    packageJson.scripts["vendor:opencv"],
    "node ../scripts/vendor-opencv.mjs",
  );
  assert.equal(packageJson.scripts.pretest, "npm run vendor:opencv");
  assert.equal(packageJson.scripts["pretest:e2e"], "npm run vendor:opencv");
  assert.match(script, /@techstark\/opencv-js/);
  assert.match(script, /dist[/\\]",?\s*"opencv\.js|dist[/\\]opencv\.js/);
  assert.match(script, /copyFile/);
  assert.match(script, /createHash\(["']sha256["']\)/);
  assert.match(script, /gzipSync/);
  assert.match(script, /12_298_343/);
  assert.equal(
    rootPackage.scripts["build:lab002"],
    "npm --prefix lab-002/web run build:pages",
  );
  assert.match(pages, /npm ci --prefix lab-002\/web/);
  assert.match(pages, /npm run build:lab002/);
  assert.match(readme, /Apache 2\.0/);
  assert.match(readme, /not loaded from a CDN/i);
  assert.match(readme, /12,298,343 bytes/);
});
