import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  stagePages,
  validatePagesStage,
} from "../../scripts/stage-pages.mjs";

test("the generated root staging directory is not committed", async () => {
  const ignore = await readFile(
    new URL("../../../.gitignore", import.meta.url),
    "utf8",
  );

  assert.match(ignore, /^web\/lab-002\/$/m);
});

test("Pages staging includes every same-origin runtime dependency", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "lab002-pages-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));

  await stagePages(temporary);
  const report = await validatePagesStage(temporary);

  assert.equal(report.missing.length, 0);
  assert.equal(report.remoteRuntimeReferences.length, 0);
  assert.equal(report.articleRuntimePath, "lab-002/");
  assert.ok(report.files.includes("js/panorama.worker.js"));
  assert.ok(report.files.includes("vendor/opencv.js"));
  assert.ok(report.files.includes("assets/samples/manifest.json"));
});

test("Pages validation fails when an article-linked runtime asset is missing", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "lab002-pages-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await stagePages(temporary);
  await rm(join(temporary, "js", "panorama.worker.js"));

  await assert.rejects(
    validatePagesStage(temporary),
    /missing staged asset: js\/panorama\.worker\.js/,
  );
});

test("Pages validation rejects remote runtime processing references", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "lab002-pages-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await stagePages(temporary);
  const workerPath = join(temporary, "js", "panorama.worker.js");
  const source = await readFile(workerPath, "utf8");
  await writeFile(
    workerPath,
    `${source}\nfetch("https://example.com/process");\n`,
    "utf8",
  );

  await assert.rejects(
    validatePagesStage(temporary),
    /remote runtime reference/,
  );
});
