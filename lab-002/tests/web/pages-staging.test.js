import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertSafeStageDestination,
  stagePages,
  validatePagesStage,
} from "../../scripts/stage-pages.mjs";

const labRoot = fileURLToPath(new URL("../..", import.meta.url));
const repositoryRoot = resolve(labRoot, "..");

test("staging rejects repository and product roots before deletion", () => {
  for (const dangerous of [
    repositoryRoot,
    resolve(repositoryRoot, "web"),
    labRoot,
    resolve(labRoot, "web"),
  ]) {
    assert.throws(
      () => assertSafeStageDestination(dangerous),
      /unsafe LAB 002 staging destination/,
    );
  }
});

test("staging allows only the expected Pages target or an isolated temp target", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "lab002-pages-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));

  assert.equal(
    assertSafeStageDestination(resolve(repositoryRoot, "web/lab-002")),
    resolve(repositoryRoot, "web/lab-002"),
  );
  assert.equal(assertSafeStageDestination(temporary), resolve(temporary));
  assert.throws(
    () => assertSafeStageDestination(resolve(repositoryRoot, "other-output")),
    /unsafe LAB 002 staging destination/,
  );
});

test("stagePages rejects an unsafe target before recursive removal", async (t) => {
  const scratchRoot = resolve(repositoryRoot, "test-results");
  await mkdir(scratchRoot, { recursive: true });
  const unsafe = await mkdtemp(join(scratchRoot, "lab002-unsafe-stage-"));
  const sentinel = join(unsafe, "do-not-delete.txt");
  await writeFile(sentinel, "preserve", "utf8");
  t.after(() => rm(unsafe, { recursive: true, force: true }));

  await assert.rejects(
    stagePages(unsafe),
    /unsafe LAB 002 staging destination/,
  );
  assert.equal(await readFile(sentinel, "utf8"), "preserve");
});

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
  assert.ok(report.files.includes("js/panorama.worker.js"));
  assert.ok(report.files.includes("js/capabilities.js"));
  assert.ok(report.files.includes("vendor/opencv.js"));
  assert.ok(report.files.includes("assets/samples/manifest.json"));
});

test("Pages validation fails when a required runtime asset is missing", async (t) => {
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
