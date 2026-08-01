import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const web = new URL("../../web/", import.meta.url);
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const run = promisify(execFile);

test("Worker lazy-loads same-origin OpenCV and source has no persistence or telemetry APIs", async () => {
  const worker = await readFile(new URL("js/fusion.worker.js", web), "utf8");
  const app = await readFile(new URL("js/app.js", web), "utf8");
  const html = await readFile(new URL("index.html", web), "utf8");
  assert.match(worker, /importScripts\("\.\.\/vendor\/opencv\.js"\)/);
  assert.doesNotMatch(html, /<script[^>]+opencv\.js/i);
  const runtime = `${worker}\n${app}`;
  assert.doesNotMatch(runtime, /localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|XMLHttpRequest/);
  assert.doesNotMatch(runtime, /fetch\s*\(/);
});

test("mobile capture, gallery, cancellation, result views, download and share are present", async () => {
  const html = await readFile(new URL("index.html", web), "utf8");
  assert.equal((html.match(/capture="environment"/g) ?? []).length, 3);
  for (const id of ["gallery-input", "sample-button", "run-button", "cancel-button", "download-button", "share-button"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const view of ["fusion", "middle", "motion"]) assert.match(html, new RegExp(`data-view="${view}"`));
});

test("LAB 003 publication files stay local-only and outside Pages", async () => {
  const publicationPaths = [
    "lab-003/article/",
    "lab-003/assets/figures/",
    "lab-003/assets/public/",
    "lab-003/docs/",
    "lab-003/output/",
    "lab-003/web/article-copy.html",
  ];
  const { stdout } = await run("git", ["ls-files", "--", ...publicationPaths], { cwd: repository });
  assert.equal(stdout.trim(), "");
  const staging = await readFile(new URL("../scripts/stage-pages.mjs", web), "utf8");
  assert.doesNotMatch(staging, /article-copy|assets\/figures|assets\/public/);
});
